[CmdletBinding()]
param(
    [string]$BaseUrl = "http://localhost:8080",
    [ValidateRange(2, 1000)]
    [int]$Rounds = 3,
    [ValidateRange(1, 100000)]
    [int]$RequestsPerRound = 200,
    [ValidateRange(1, 1000)]
    [int]$Concurrency = 20,
    [ValidateRange(1, 10000)]
    [int]$WarmupRequests = 10,
    [ValidateRange(1, 1000000)]
    [int]$MinimumJobCount = 1,
    [ValidateRange(0, 10000)]
    [int]$FixtureJobCount = 0,
    [ValidateRange(96, 2000)]
    [int]$FixtureDescriptionLength = 256,
    [string]$AdminUsername = "admin@local.test",
    [string]$AdminPassword = "admin123",
    [string]$RedisService = "redis",
    [string]$CacheKey = "offerpilot::jobs-open::all",
    [switch]$UseProxy,
    [switch]$SkipBuild,
    [string]$OutputDirectory = (Join-Path ([System.IO.Path]::GetTempPath()) "offerpilot-benchmark")
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Net.Http

function Get-Percentile {
    param([double[]]$Values, [ValidateRange(0.0, 1.0)][double]$Percentile)

    $sorted = @($Values | Sort-Object)
    $index = [Math]::Max(0, [Math]::Ceiling($Percentile * $sorted.Count) - 1)
    return [Math]::Round($sorted[$index], 2)
}

function Get-LatencySummary {
    param([double[]]$Latencies, [double]$ElapsedSeconds)

    return [ordered]@{
        elapsedSeconds = [Math]::Round($ElapsedSeconds, 3)
        throughputRequestsPerSecond = [Math]::Round($Latencies.Count / $ElapsedSeconds, 2)
        latencyMs = [ordered]@{
            p50 = Get-Percentile -Values $Latencies -Percentile 0.50
            p95 = Get-Percentile -Values $Latencies -Percentile 0.95
            p99 = Get-Percentile -Values $Latencies -Percentile 0.99
            min = [Math]::Round(($Latencies | Measure-Object -Minimum).Minimum, 2)
            max = [Math]::Round(($Latencies | Measure-Object -Maximum).Maximum, 2)
        }
    }
}

function Get-Sha256Hex {
    param([byte[]]$Bytes)

    $sha256 = [System.Security.Cryptography.SHA256]::Create()
    try {
        return ([BitConverter]::ToString($sha256.ComputeHash($Bytes))).Replace("-", "").ToLowerInvariant()
    }
    finally {
        $sha256.Dispose()
    }
}

function Get-JobFingerprint {
    param([byte[]]$Body)

    $json = [Text.Encoding]::UTF8.GetString($Body)
    $jobs = ConvertFrom-Json -InputObject $json
    return [pscustomobject]@{
        Sha256 = Get-Sha256Hex -Bytes $Body
        JobCount = @($jobs).Count
    }
}

function Invoke-TimedJobGet {
    param([System.Net.Http.HttpClient]$Client, [Uri]$Uri)

    $watch = [System.Diagnostics.Stopwatch]::StartNew()
    $response = $Client.GetAsync($Uri).GetAwaiter().GetResult()
    try {
        $body = $response.Content.ReadAsByteArrayAsync().GetAwaiter().GetResult()
        $watch.Stop()
        if (-not $response.IsSuccessStatusCode) {
            throw "GET $Uri returned HTTP $([int]$response.StatusCode)."
        }
        $fingerprint = Get-JobFingerprint -Body $body
        return [pscustomobject]@{
            LatencyMs = $watch.Elapsed.TotalMilliseconds
            Sha256 = $fingerprint.Sha256
            JobCount = $fingerprint.JobCount
        }
    }
    finally {
        $response.Dispose()
    }
}

function Get-PublicJobFingerprint {
    $sample = Invoke-TimedJobGet -Client $httpClient -Uri $jobsUri
    return [pscustomobject]@{
        Sha256 = $sample.Sha256
        JobCount = $sample.JobCount
    }
}

function New-FixtureDescription {
    param([string]$RunMarker, [int]$Index, [int]$Length)

    $prefix = "$RunMarker fixture $Index "
    if ($prefix.Length -gt $Length) {
        throw "FixtureDescriptionLength=$Length is too short for the run marker."
    }
    return $prefix + [string]::Empty.PadRight($Length - $prefix.Length, [char]'x')
}

function Add-FixtureJobs {
    param(
        [int]$Count,
        [string]$RunMarker,
        [System.Collections.Generic.List[long]]$CapturedIds
    )

    for ($index = 1; $index -le $Count; $index++) {
        $payload = [ordered]@{
            title = "$RunMarker-$index"
            description = New-FixtureDescription `
                -RunMarker $RunMarker `
                -Index $index `
                -Length $FixtureDescriptionLength
            company = "OfferPilot benchmark fixture"
        }
        $json = ConvertTo-Json -InputObject $payload -Compress
        $content = [System.Net.Http.StringContent]::new(
            $json,
            [Text.Encoding]::UTF8,
            "application/json"
        )
        try {
            $response = $adminClient.PostAsync($jobsUri, $content).GetAwaiter().GetResult()
            try {
                $body = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
                if ([int]$response.StatusCode -ne 201) {
                    throw "Fixture creation $index/$Count returned HTTP $([int]$response.StatusCode)."
                }
                $created = ConvertFrom-Json -InputObject $body
                $createdId = [long]$created.id
                if ($createdId -lt 1) {
                    throw "Fixture creation $index/$Count returned an invalid job id."
                }
                $CapturedIds.Add($createdId)
            }
            finally {
                $response.Dispose()
            }
        }
        finally {
            $content.Dispose()
        }
    }
}

function Remove-FixtureJobs {
    param([System.Collections.Generic.List[long]]$CapturedIds)

    $failures = [System.Collections.Generic.List[string]]::new()
    foreach ($createdId in $CapturedIds) {
        $deleteUri = [Uri]("{0}/{1}" -f $jobsUri.AbsoluteUri.TrimEnd('/'), $createdId)
        try {
            $response = $adminClient.DeleteAsync($deleteUri).GetAwaiter().GetResult()
            try {
                if ([int]$response.StatusCode -ne 204) {
                    $failures.Add("job id $createdId returned HTTP $([int]$response.StatusCode)")
                }
            }
            finally {
                $response.Dispose()
            }
        }
        catch {
            $failures.Add("job id $createdId failed: $($_.Exception.Message)")
        }
    }
    if ($failures.Count -gt 0) {
        throw "Fixture cleanup failures: $($failures -join '; ')."
    }
}

function Invoke-ConcurrentJobGets {
    param(
        [System.Net.Http.HttpClient]$Client,
        [Uri]$Uri,
        [int]$Count,
        [int]$MaximumConcurrency
    )

    $pending = [System.Collections.ArrayList]::new()
    $latencies = [System.Collections.Generic.List[double]]::new()
    $samples = [System.Collections.ArrayList]::new()
    $cancellation = [System.Threading.CancellationTokenSource]::new()
    $started = 0
    $completed = 0
    $totalWatch = [System.Diagnostics.Stopwatch]::StartNew()

    try {
        while ($completed -lt $Count) {
            while (($started -lt $Count) -and ($pending.Count -lt $MaximumConcurrency)) {
                $requestWatch = [System.Diagnostics.Stopwatch]::StartNew()
                $task = $Client.GetAsync($Uri, $cancellation.Token)
                [void]$pending.Add([pscustomobject]@{ Task = $task; Watch = $requestWatch })
                $started++
            }

            $tasks = [System.Threading.Tasks.Task[System.Net.Http.HttpResponseMessage][]]@(
                $pending | ForEach-Object { $_.Task }
            )
            $finishedTask = [System.Threading.Tasks.Task]::WhenAny($tasks).GetAwaiter().GetResult()
            $finishedIndex = -1
            for ($index = 0; $index -lt $pending.Count; $index++) {
                if ([object]::ReferenceEquals($pending[$index].Task, $finishedTask)) {
                    $finishedIndex = $index
                    break
                }
            }
            if ($finishedIndex -lt 0) {
                throw "Unable to match a completed HTTP task."
            }

            $holder = $pending[$finishedIndex]
            $response = $holder.Task.GetAwaiter().GetResult()
            try {
                $body = $response.Content.ReadAsByteArrayAsync().GetAwaiter().GetResult()
                $holder.Watch.Stop()
                if (-not $response.IsSuccessStatusCode) {
                    throw "GET $Uri returned HTTP $([int]$response.StatusCode)."
                }
                $fingerprint = Get-JobFingerprint -Body $body
                $latencies.Add($holder.Watch.Elapsed.TotalMilliseconds)
                [void]$samples.Add($fingerprint)
            }
            finally {
                $response.Dispose()
            }

            $pending.RemoveAt($finishedIndex)
            $completed++
        }
    }
    finally {
        $totalWatch.Stop()
        if ($pending.Count -gt 0) {
            $cancellation.Cancel()
            foreach ($holder in @($pending)) {
                try {
                    $unfinishedResponse = $holder.Task.GetAwaiter().GetResult()
                    if ($null -ne $unfinishedResponse) {
                        $unfinishedResponse.Dispose()
                    }
                }
                catch {
                    # Cancellation and request failures are expected during cleanup.
                }
                $holder.Watch.Stop()
            }
        }
        $cancellation.Dispose()
    }

    return [pscustomobject]@{
        Latencies = $latencies.ToArray()
        Samples = @($samples)
        ElapsedSeconds = $totalWatch.Elapsed.TotalSeconds
    }
}

function Assert-Fingerprints {
    param(
        [object[]]$Samples,
        [ref]$ExpectedHash,
        [ref]$ExpectedCount,
        [int]$MinimumCount
    )

    foreach ($sample in $Samples) {
        if ($null -eq $ExpectedHash.Value) {
            if ($sample.JobCount -lt $MinimumCount) {
                throw "Dataset contains $($sample.JobCount) jobs, below MinimumJobCount=$MinimumCount."
            }
            $ExpectedHash.Value = $sample.Sha256
            $ExpectedCount.Value = $sample.JobCount
            continue
        }
        if (($sample.Sha256 -ne $ExpectedHash.Value) -or ($sample.JobCount -ne $ExpectedCount.Value)) {
            throw "Job data changed during the benchmark; response count or SHA-256 no longer matches."
        }
    }
}

function Invoke-ComposeChecked {
    param([string[]]$Arguments)

    Push-Location $projectRoot
    $previousErrorActionPreference = $ErrorActionPreference
    try {
        # Windows PowerShell can surface normal Docker progress written to stderr as a terminating error.
        $ErrorActionPreference = "Continue"
        $output = @(& docker compose @Arguments 2>&1)
        $exitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $previousErrorActionPreference
        Pop-Location
    }
    if ($exitCode -ne 0) {
        throw "docker compose $($Arguments -join ' ') failed: $($output -join ' ')"
    }
    return $output
}

function Get-EnteredBackendCacheType {
    $containerIds = @(Invoke-ComposeChecked -Arguments @("ps", "-q", "backend"))
    if ($containerIds.Count -gt 0 -and -not [string]::IsNullOrWhiteSpace($containerIds[0].ToString())) {
        try {
            $actualOutput = Invoke-ComposeChecked -Arguments @("exec", "-T", "backend", "printenv", "SPRING_CACHE_TYPE")
            $actualType = ($actualOutput | Select-Object -Last 1).ToString().Trim()
            if (-not [string]::IsNullOrWhiteSpace($actualType)) {
                return $actualType
            }
        }
        catch {
            # Images created before SPRING_CACHE_TYPE was added return exit code 1 from printenv.
            # Falling through to the rendered Compose value lets those running containers upgrade safely.
        }
    }

    $configJson = (Invoke-ComposeChecked -Arguments @("config", "--format", "json")) -join "`n"
    $config = ConvertFrom-Json -InputObject $configJson
    return $config.services.backend.environment.SPRING_CACHE_TYPE.ToString().Trim()
}

function Set-ProcessCacheType {
    param([AllowNull()][string]$CacheType)

    [Environment]::SetEnvironmentVariable(
        "SPRING_CACHE_TYPE",
        $CacheType,
        [EnvironmentVariableTarget]::Process
    )
}

function Restart-Backend {
    param([string]$CacheType)

    Set-ProcessCacheType -CacheType $CacheType
    $null = Invoke-ComposeChecked -Arguments @("up", "-d", "--no-deps", "--force-recreate", "backend")
    Wait-BackendHealth -ExpectedCacheType $CacheType
}

function Wait-BackendHealth {
    param([string]$ExpectedCacheType, [int]$TimeoutSeconds = 120)

    $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
    $lastStatus = "no response"
    while ([DateTime]::UtcNow -lt $deadline) {
        try {
            $response = $httpClient.GetAsync($healthUri).GetAwaiter().GetResult()
            try {
                $lastStatus = "HTTP $([int]$response.StatusCode)"
                if ($response.IsSuccessStatusCode) {
                    $actualTypeOutput = Invoke-ComposeChecked -Arguments @(
                        "exec", "-T", "backend", "printenv", "SPRING_CACHE_TYPE"
                    )
                    $actualType = ($actualTypeOutput | Select-Object -Last 1).Trim()
                    if ($actualType -ne $ExpectedCacheType) {
                        throw "Backend started with cache type '$actualType', expected '$ExpectedCacheType'."
                    }
                    return
                }
            }
            finally {
                $response.Dispose()
            }
        }
        catch {
            $lastStatus = $_.Exception.Message
        }
        Start-Sleep -Milliseconds 500
    }
    throw "Backend did not become healthy with cache type '$ExpectedCacheType': $lastStatus"
}

function Remove-KnownOpenJobsCacheKey {
    $output = Invoke-ComposeChecked -Arguments @(
        "exec", "-T", $RedisService, "redis-cli", "--raw", "DEL", $CacheKey
    )
    $deleteCountText = $output | Where-Object { $_ -match '^\d+$' } | Select-Object -Last 1
    if ($null -eq $deleteCountText) {
        throw "Redis DEL did not return a numeric result."
    }
    return [int]$deleteCountText
}

function Get-RepositoryLoadCount {
    $response = $adminClient.GetAsync($metricsUri).GetAwaiter().GetResult()
    try {
        $body = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
        if (-not $response.IsSuccessStatusCode) {
            throw "Prometheus endpoint returned HTTP $([int]$response.StatusCode)."
        }
        $pattern = '^offerpilot_job_repository_loads_total\{[^}]*query="open-jobs"[^}]*\}\s+([0-9.eE+-]+)$'
        foreach ($line in ($body -split "`n")) {
            if ($line.Trim() -match $pattern) {
                return [double]::Parse($Matches[1], [Globalization.CultureInfo]::InvariantCulture)
            }
        }
        throw "Prometheus did not expose the open-jobs repository load counter."
    }
    finally {
        $response.Dispose()
    }
}

function Invoke-Scenario {
    param([ValidateSet("none", "redis")][string]$CacheType)

    Restart-Backend -CacheType $CacheType
    $deletedEntries = $null
    if ($CacheType -eq "redis") {
        $deletedEntries = Remove-KnownOpenJobsCacheKey
    }

    $loadsBeforeWarmup = Get-RepositoryLoadCount
    $expectedHash = $null
    $expectedCount = $null
    for ($index = 0; $index -lt $WarmupRequests; $index++) {
        $sample = Invoke-TimedJobGet -Client $httpClient -Uri $jobsUri
        Assert-Fingerprints `
            -Samples @($sample) `
            -ExpectedHash ([ref]$expectedHash) `
            -ExpectedCount ([ref]$expectedCount) `
            -MinimumCount $MinimumJobCount
    }
    $loadsBefore = Get-RepositoryLoadCount

    $roundResults = [System.Collections.ArrayList]::new()
    $allLatencies = [System.Collections.Generic.List[double]]::new()
    $totalElapsed = 0.0
    for ($round = 1; $round -le $Rounds; $round++) {
        $run = Invoke-ConcurrentJobGets `
            -Client $httpClient `
            -Uri $jobsUri `
            -Count $RequestsPerRound `
            -MaximumConcurrency $Concurrency
        Assert-Fingerprints `
            -Samples $run.Samples `
            -ExpectedHash ([ref]$expectedHash) `
            -ExpectedCount ([ref]$expectedCount) `
            -MinimumCount $MinimumJobCount
        foreach ($latency in $run.Latencies) {
            $allLatencies.Add($latency)
        }
        $totalElapsed += $run.ElapsedSeconds
        $roundSummary = Get-LatencySummary -Latencies $run.Latencies -ElapsedSeconds $run.ElapsedSeconds
        $roundSummary["round"] = $round
        [void]$roundResults.Add($roundSummary)
    }

    $loadsAfter = Get-RepositoryLoadCount
    $totalSummary = Get-LatencySummary -Latencies $allLatencies.ToArray() -ElapsedSeconds $totalElapsed
    $totalSummary["requests"] = $allLatencies.Count

    return [ordered]@{
        cacheType = $CacheType
        cacheKeyEntriesDeleted = $deletedEntries
        warmupRequests = $WarmupRequests
        rounds = @($roundResults)
        total = $totalSummary
        response = [ordered]@{ jobCount = $expectedCount; sha256 = $expectedHash }
        repositorySourceLoads = [ordered]@{
            metric = "offerpilot_job_repository_loads_total"
            query = "open-jobs"
            before = $loadsBefore
            after = $loadsAfter
            warmupDelta = [Math]::Round($loadsBefore - $loadsBeforeWarmup, 3)
            measuredDelta = [Math]::Round($loadsAfter - $loadsBefore, 3)
        }
    }
}

function Get-PercentChange {
    param([double]$Baseline, [double]$Candidate)

    if ($Baseline -eq 0.0) {
        return $null
    }
    return [Math]::Round((($Candidate - $Baseline) / $Baseline) * 100.0, 2)
}

$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\.."))
$jobsUri = [Uri]("{0}/api/jobs" -f $BaseUrl.TrimEnd('/'))
$healthUri = [Uri]("{0}/actuator/health" -f $BaseUrl.TrimEnd('/'))
$metricsUri = [Uri]("{0}/actuator/prometheus" -f $BaseUrl.TrimEnd('/'))
$httpHandler = [System.Net.Http.HttpClientHandler]::new()
$httpHandler.UseProxy = $UseProxy.IsPresent
$httpClient = [System.Net.Http.HttpClient]::new($httpHandler)
$httpClient.Timeout = [TimeSpan]::FromSeconds(30)
$adminHandler = [System.Net.Http.HttpClientHandler]::new()
$adminHandler.UseProxy = $UseProxy.IsPresent
$adminClient = [System.Net.Http.HttpClient]::new($adminHandler)
$adminClient.Timeout = [TimeSpan]::FromSeconds(30)
$credentialBytes = [Text.Encoding]::UTF8.GetBytes("$AdminUsername`:$AdminPassword")
$adminClient.DefaultRequestHeaders.Authorization = [System.Net.Http.Headers.AuthenticationHeaderValue]::new(
    "Basic",
    [Convert]::ToBase64String($credentialBytes)
)
[Array]::Clear($credentialBytes, 0, $credentialBytes.Length)

$originalCacheTypeWasSet = Test-Path Env:SPRING_CACHE_TYPE
$originalCacheType = [Environment]::GetEnvironmentVariable("SPRING_CACHE_TYPE", "Process")
$enteredBackendCacheType = Get-EnteredBackendCacheType
$measurementFailure = $null
$restorationFailure = $null
$cleanupFailure = $null
$cleanupVerificationFailure = $null
$result = $null
$startedAt = [DateTimeOffset]::UtcNow
$runMarker = "offerpilot-benchmark-$($startedAt.ToString("yyyyMMddHHmmss"))-$([Guid]::NewGuid().ToString("N"))"
$fixtureIds = [System.Collections.Generic.List[long]]::new()
$originalFingerprint = $null
$restoredFingerprint = $null

try {
    if (-not $SkipBuild.IsPresent) {
        $null = Invoke-ComposeChecked -Arguments @("build", "backend")
    }

    $originalFingerprint = Get-PublicJobFingerprint
    if ($FixtureJobCount -gt 0) {
        Write-Output "Fixture run marker: $runMarker"
        Add-FixtureJobs -Count $FixtureJobCount -RunMarker $runMarker -CapturedIds $fixtureIds
    }

    $disabled = Invoke-Scenario -CacheType "none"
    $enabled = Invoke-Scenario -CacheType "redis"
    if (($disabled.response.sha256 -ne $enabled.response.sha256) -or
            ($disabled.response.jobCount -ne $enabled.response.jobCount)) {
        throw "Cache-disabled and cache-enabled responses differ in count or SHA-256."
    }
    $expectedMeasurementCount = $originalFingerprint.JobCount + $fixtureIds.Count
    if ($enabled.response.jobCount -ne $expectedMeasurementCount) {
        throw "Measured dataset contains $($enabled.response.jobCount) jobs; expected $expectedMeasurementCount after fixture creation."
    }

    $result = [ordered]@{
        schemaVersion = 2
        timestampUtc = $startedAt.ToString("o")
        endpoint = $jobsUri.AbsoluteUri
        scope = "Controlled local same-machine comparison for this dataset and runtime only; not a production capacity claim."
        configuration = [ordered]@{
            rounds = $Rounds
            requestsPerRound = $RequestsPerRound
            concurrency = [Math]::Min($Concurrency, $RequestsPerRound)
            warmupRequestsPerScenario = $WarmupRequests
            minimumJobCount = $MinimumJobCount
            fixtureJobCount = $FixtureJobCount
            fixtureDescriptionLength = $FixtureDescriptionLength
            proxyEnabled = $UseProxy.IsPresent
        }
        dataset = [ordered]@{
            runMarker = $(if ($FixtureJobCount -gt 0) { $runMarker } else { $null })
            originalJobCount = $originalFingerprint.JobCount
            originalSha256 = $originalFingerprint.Sha256
            fixtureJobsCreated = $fixtureIds.Count
            measurementJobCount = $enabled.response.jobCount
            createdJobIds = @($fixtureIds)
        }
        cacheDisabled = $disabled
        cacheEnabled = $enabled
        comparisonPercent = [ordered]@{
            throughputChange = Get-PercentChange -Baseline $disabled.total.throughputRequestsPerSecond -Candidate $enabled.total.throughputRequestsPerSecond
            p50LatencyChange = Get-PercentChange -Baseline $disabled.total.latencyMs.p50 -Candidate $enabled.total.latencyMs.p50
            p95LatencyChange = Get-PercentChange -Baseline $disabled.total.latencyMs.p95 -Candidate $enabled.total.latencyMs.p95
            p99LatencyChange = Get-PercentChange -Baseline $disabled.total.latencyMs.p99 -Candidate $enabled.total.latencyMs.p99
            repositorySourceLoadChange = Get-PercentChange -Baseline $disabled.repositorySourceLoads.measuredDelta -Candidate $enabled.repositorySourceLoads.measuredDelta
        }
    }
}
catch {
    $measurementFailure = $_
}
finally {
    try {
        Set-ProcessCacheType -CacheType $enteredBackendCacheType
        $null = Invoke-ComposeChecked -Arguments @("up", "-d", "--no-deps", "--force-recreate", "backend")
        Wait-BackendHealth -ExpectedCacheType $enteredBackendCacheType
    }
    catch {
        $restorationFailure = $_
    }
    finally {
        try {
            if ($fixtureIds.Count -gt 0) {
                Remove-FixtureJobs -CapturedIds $fixtureIds
            }
        }
        catch {
            $cleanupFailure = $_
        }

        if ($null -ne $originalFingerprint) {
            try {
                $restoredFingerprint = Get-PublicJobFingerprint
                if (($restoredFingerprint.JobCount -ne $originalFingerprint.JobCount) -or
                        ($restoredFingerprint.Sha256 -ne $originalFingerprint.Sha256)) {
                    throw "Public job list did not return to its original count and SHA-256 after fixture cleanup."
                }
            }
            catch {
                $cleanupVerificationFailure = $_
            }
        }

        Set-ProcessCacheType -CacheType $(if ($originalCacheTypeWasSet) { $originalCacheType } else { $null })
        $adminClient.Dispose()
        $adminHandler.Dispose()
        $httpClient.Dispose()
        $httpHandler.Dispose()
    }
}

$failures = [System.Collections.Generic.List[string]]::new()
if ($null -eq $restorationFailure) {
    Write-Output "Backend restored with SPRING_CACHE_TYPE=$enteredBackendCacheType."
}
if (($null -ne $originalFingerprint) -and
        ($null -eq $cleanupFailure) -and
        ($null -eq $cleanupVerificationFailure)) {
    Write-Output "Dataset cleanup verified: $($restoredFingerprint.JobCount) original jobs restored."
}
if ($null -ne $measurementFailure) {
    $failures.Add("measurement: $($measurementFailure.Exception.Message)")
}
if ($null -ne $restorationFailure) {
    $failures.Add("backend restoration: $($restorationFailure.Exception.Message)")
}
if ($null -ne $cleanupFailure) {
    $failures.Add("fixture cleanup: $($cleanupFailure.Exception.Message)")
}
if ($null -ne $cleanupVerificationFailure) {
    $failures.Add("cleanup verification: $($cleanupVerificationFailure.Exception.Message)")
}
if ($failures.Count -gt 0) {
    throw "Benchmark failed after restoration and fixture cleanup: $($failures -join ' | ')"
}

$result["restoration"] = [ordered]@{
    originalProcessSettingPresent = $originalCacheTypeWasSet
    restoredCacheType = $enteredBackendCacheType
    backendHealthy = $true
}
$result.dataset["cleanup"] = [ordered]@{
    attemptedFixtureJobIds = $fixtureIds.Count
    fixtureJobsDeleted = $fixtureIds.Count
    restoredJobCount = $restoredFingerprint.JobCount
    restoredSha256 = $restoredFingerprint.Sha256
    matchesOriginal = $true
}
$result["completedAtUtc"] = [DateTimeOffset]::UtcNow.ToString("o")

New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
$fileStamp = $startedAt.ToString("yyyyMMdd-HHmmss'Z'")
$jsonPath = Join-Path $OutputDirectory "job-cache-comparison-$fileStamp.json"
$textPath = Join-Path $OutputDirectory "job-cache-comparison-$fileStamp.txt"
$result | ConvertTo-Json -Depth 8 | Set-Content -Path $jsonPath -Encoding UTF8

$summary = [System.Collections.Generic.List[string]]::new()
$summary.Add("OfferPilot cache-enabled vs cache-disabled benchmark")
$summary.Add("Timestamp (UTC): $($result.timestampUtc)")
$summary.Add("Endpoint: $($result.endpoint)")
$summary.Add("Scope: $($result.scope)")
$summary.Add("Dataset: $($result.dataset.originalJobCount) original + $($result.dataset.fixtureJobsCreated) fixture = $($result.dataset.measurementJobCount) measured jobs")
foreach ($scenario in @($result.cacheDisabled, $result.cacheEnabled)) {
    $summary.Add("$($scenario.cacheType): $($scenario.total.throughputRequestsPerSecond) req/s; P50 $($scenario.total.latencyMs.p50) ms; P95 $($scenario.total.latencyMs.p95) ms; P99 $($scenario.total.latencyMs.p99) ms; repository source loads $($scenario.repositorySourceLoads.measuredDelta)")
    foreach ($round in $scenario.rounds) {
        $summary.Add("  round $($round.round): $($round.throughputRequestsPerSecond) req/s; P50 $($round.latencyMs.p50) ms; P95 $($round.latencyMs.p95) ms; P99 $($round.latencyMs.p99) ms")
    }
}
$summary.Add("Response parity: $($result.cacheEnabled.response.jobCount) jobs; SHA-256 $($result.cacheEnabled.response.sha256)")
$summary.Add("Controlled-run changes: throughput $($result.comparisonPercent.throughputChange)%; P50 $($result.comparisonPercent.p50LatencyChange)%; P95 $($result.comparisonPercent.p95LatencyChange)%; P99 $($result.comparisonPercent.p99LatencyChange)%; repository loads $($result.comparisonPercent.repositorySourceLoadChange)%")
$summary.Add("Restoration: backend healthy with SPRING_CACHE_TYPE=$($result.restoration.restoredCacheType)")
$summary.Add("Cleanup: original count and SHA-256 restored = $($result.dataset.cleanup.matchesOriginal)")
$summary.Add("JSON: $jsonPath")
$summary | Set-Content -Path $textPath -Encoding UTF8
$summary | Write-Output
Write-Output "Text: $textPath"
