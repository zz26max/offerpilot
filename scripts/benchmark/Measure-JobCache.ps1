[CmdletBinding()]
param(
    [string]$BaseUrl = "http://localhost:8080",
    [ValidateRange(1, 100000)]
    [int]$Requests = 200,
    [ValidateRange(1, 1000)]
    [int]$Concurrency = 20,
    [ValidateRange(0, 10000)]
    [int]$WarmupRequests = 10,
    [string]$RedisService = "redis",
    [string]$CacheKey = "offerpilot::jobs-open::all",
    [switch]$UseProxy,
    [string]$OutputDirectory = (Join-Path ([System.IO.Path]::GetTempPath()) "offerpilot-benchmark")
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Net.Http

function Get-Percentile {
    param(
        [double[]]$Values,
        [ValidateRange(0.0, 1.0)]
        [double]$Percentile
    )

    $sorted = @($Values | Sort-Object)
    $index = [Math]::Max(0, [Math]::Ceiling($Percentile * $sorted.Count) - 1)
    return [Math]::Round($sorted[$index], 2)
}

function Invoke-TimedGet {
    param(
        [System.Net.Http.HttpClient]$Client,
        [Uri]$Uri
    )

    $watch = [System.Diagnostics.Stopwatch]::StartNew()
    $response = $Client.GetAsync($Uri).GetAwaiter().GetResult()
    try {
        $body = $response.Content.ReadAsByteArrayAsync().GetAwaiter().GetResult()
        $watch.Stop()
        if (-not $response.IsSuccessStatusCode) {
            throw "GET $Uri returned HTTP $([int]$response.StatusCode)."
        }
        return [pscustomobject]@{
            LatencyMs = [Math]::Round($watch.Elapsed.TotalMilliseconds, 2)
            StatusCode = [int]$response.StatusCode
            Bytes = $body.Length
        }
    }
    finally {
        $response.Dispose()
    }
}

function Invoke-ConcurrentGets {
    param(
        [System.Net.Http.HttpClient]$Client,
        [Uri]$Uri,
        [int]$Count,
        [int]$MaximumConcurrency
    )

    $pending = [System.Collections.ArrayList]::new()
    $latencies = [System.Collections.Generic.List[double]]::new()
    $started = 0
    $completed = 0
    $totalWatch = [System.Diagnostics.Stopwatch]::StartNew()

    while ($completed -lt $Count) {
        while (($started -lt $Count) -and ($pending.Count -lt $MaximumConcurrency)) {
            $requestWatch = [System.Diagnostics.Stopwatch]::StartNew()
            $task = $Client.GetAsync($Uri)
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
            $latencies.Add($holder.Watch.Elapsed.TotalMilliseconds)
            $null = $body.Length
        }
        finally {
            $response.Dispose()
        }

        $pending.RemoveAt($finishedIndex)
        $completed++
    }

    $totalWatch.Stop()
    return [pscustomobject]@{
        Latencies = $latencies.ToArray()
        ElapsedSeconds = $totalWatch.Elapsed.TotalSeconds
    }
}

$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\.."))
$jobsUri = [Uri]("{0}/api/jobs" -f $BaseUrl.TrimEnd('/'))
$healthUri = [Uri]("{0}/actuator/health" -f $BaseUrl.TrimEnd('/'))
$handler = [System.Net.Http.HttpClientHandler]::new()
$handler.UseProxy = $UseProxy.IsPresent
$client = [System.Net.Http.HttpClient]::new($handler)
$client.Timeout = [TimeSpan]::FromSeconds(30)

try {
    $null = Invoke-TimedGet -Client $client -Uri $healthUri

    Push-Location $projectRoot
    try {
        $deleteOutput = @(& docker compose exec -T $RedisService redis-cli --raw DEL $CacheKey 2>&1)
        $dockerExitCode = $LASTEXITCODE
    }
    finally {
        Pop-Location
    }
    if ($dockerExitCode -ne 0) {
        throw "Could not delete the known cache key from Redis: $($deleteOutput -join ' ')"
    }
    $deleteCountText = ($deleteOutput | Where-Object { $_ -match '^\d+$' } | Select-Object -Last 1)
    if ($null -eq $deleteCountText) {
        throw "Redis DEL did not return a numeric result: $($deleteOutput -join ' ')"
    }

    $cold = Invoke-TimedGet -Client $client -Uri $jobsUri

    for ($index = 0; $index -lt $WarmupRequests; $index++) {
        $null = Invoke-TimedGet -Client $client -Uri $jobsUri
    }

    $warm = Invoke-ConcurrentGets -Client $client -Uri $jobsUri -Count $Requests -MaximumConcurrency $Concurrency
    $throughput = $Requests / $warm.ElapsedSeconds
    $timestamp = [DateTimeOffset]::UtcNow
    $result = [ordered]@{
        schemaVersion = 1
        timestampUtc = $timestamp.ToString("o")
        endpoint = $jobsUri.AbsoluteUri
        scope = "One cache-key deletion followed by one cold request, warm-up requests, then concurrent warm-cache requests. No no-cache baseline."
        coldCache = [ordered]@{
            redisKey = $CacheKey
            entriesDeleted = [int]$deleteCountText
            latencyMs = $cold.LatencyMs
            statusCode = $cold.StatusCode
            responseBytes = $cold.Bytes
        }
        warmCache = [ordered]@{
            requests = $Requests
            concurrency = [Math]::Min($Concurrency, $Requests)
            warmupRequests = $WarmupRequests
            elapsedSeconds = [Math]::Round($warm.ElapsedSeconds, 3)
            throughputRequestsPerSecond = [Math]::Round($throughput, 2)
            latencyMs = [ordered]@{
                p50 = Get-Percentile -Values $warm.Latencies -Percentile 0.50
                p95 = Get-Percentile -Values $warm.Latencies -Percentile 0.95
                p99 = Get-Percentile -Values $warm.Latencies -Percentile 0.99
                min = [Math]::Round(($warm.Latencies | Measure-Object -Minimum).Minimum, 2)
                max = [Math]::Round(($warm.Latencies | Measure-Object -Maximum).Maximum, 2)
            }
        }
    }

    New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
    $fileStamp = $timestamp.ToString("yyyyMMdd-HHmmss'Z'")
    $jsonPath = Join-Path $OutputDirectory "job-cache-$fileStamp.json"
    $textPath = Join-Path $OutputDirectory "job-cache-$fileStamp.txt"
    $result | ConvertTo-Json -Depth 6 | Set-Content -Path $jsonPath -Encoding UTF8

    $summary = @(
        "OfferPilot job cache benchmark"
        "Timestamp (UTC): $($result.timestampUtc)"
        "Endpoint: $($result.endpoint)"
        "Scope: $($result.scope)"
        "Cold request: $($result.coldCache.latencyMs) ms (Redis key entries deleted: $($result.coldCache.entriesDeleted))"
        "Warm run: $Requests requests, concurrency $($result.warmCache.concurrency), $($result.warmCache.throughputRequestsPerSecond) req/s"
        "Warm latency: P50 $($result.warmCache.latencyMs.p50) ms, P95 $($result.warmCache.latencyMs.p95) ms, P99 $($result.warmCache.latencyMs.p99) ms"
        "JSON: $jsonPath"
    )
    $summary | Set-Content -Path $textPath -Encoding UTF8
    $summary | Write-Output
    Write-Output "Text: $textPath"
}
finally {
    $client.Dispose()
    $handler.Dispose()
}
