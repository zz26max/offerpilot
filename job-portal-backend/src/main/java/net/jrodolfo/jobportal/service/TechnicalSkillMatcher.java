package net.jrodolfo.jobportal.service;

import org.springframework.stereotype.Component;

import java.text.Normalizer;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;
import java.util.stream.IntStream;

@Component
public class TechnicalSkillMatcher {

    private static final String TOKEN_BOUNDARY = "[\\p{IsLatin}\\p{N}]";

    private static final List<SkillDefinition> SKILLS = List.of(
            skill("Java", "java"),
            skill("Spring Boot", "spring boot", "springboot"),
            skill("MySQL", "mysql", "my sql"),
            skill("Redis", "redis"),
            skill("RabbitMQ", "rabbitmq", "rabbit mq"),
            skill("Docker", "docker"),
            skill("Kubernetes", "kubernetes", "k8s"),
            skill("Kafka", "kafka", "apache kafka"),
            skill("Elasticsearch", "elasticsearch", "elastic search"),
            skill("Git", "git"),
            skill("Maven", "maven", "apache maven"),
            skill("Gradle", "gradle"),
            skill("JUnit", "junit", "junit 5", "junit5"),
            skill("Mockito", "mockito"),
            skill("REST API", "rest api", "rest apis", "restful api", "restful apis"),
            skill("Microservices", "microservice", "microservices", "micro service", "micro services", "micro-service", "micro-services"),
            skill("React", "react", "react.js", "reactjs"),
            skill("Vue", "vue", "vue.js", "vuejs"),
            skill("TypeScript", "typescript", "type script"),
            skill("JavaScript", "javascript", "java script", "java-script"),
            skill("HTML", "html", "html5"),
            skill("CSS", "css", "css3"),
            skill("AWS", "aws", "amazon web services")
    );

    public List<String> findSkills(String text) {
        if (text == null || text.isBlank()) {
            return List.of();
        }

        String normalizedText = normalize(text);
        List<DetectedAlias> detectedAliases = new ArrayList<>();
        for (int skillIndex = 0; skillIndex < SKILLS.size(); skillIndex++) {
            for (Pattern pattern : SKILLS.get(skillIndex).aliasPatterns()) {
                var matcher = pattern.matcher(normalizedText);
                while (matcher.find()) {
                    detectedAliases.add(new DetectedAlias(skillIndex, matcher.start(), matcher.end()));
                }
            }
        }

        detectedAliases.sort(Comparator
                .comparingInt(DetectedAlias::length).reversed()
                .thenComparingInt(DetectedAlias::skillIndex));
        List<DetectedAlias> acceptedAliases = new ArrayList<>();
        Set<Integer> acceptedSkillIndexes = new HashSet<>();
        for (DetectedAlias candidate : detectedAliases) {
            boolean overlaps = acceptedAliases.stream().anyMatch(accepted -> candidate.overlaps(accepted));
            if (!overlaps) {
                acceptedAliases.add(candidate);
                acceptedSkillIndexes.add(candidate.skillIndex());
            }
        }

        return IntStream.range(0, SKILLS.size())
                .filter(acceptedSkillIndexes::contains)
                .mapToObj(index -> SKILLS.get(index).name())
                .toList();
    }

    static List<String> supportedSkills() {
        return SKILLS.stream().map(SkillDefinition::name).toList();
    }

    private static SkillDefinition skill(String name, String... aliases) {
        List<Pattern> patterns = List.of(aliases).stream()
                .map(TechnicalSkillMatcher::aliasPattern)
                .toList();
        return new SkillDefinition(name, patterns);
    }

    private static Pattern aliasPattern(String alias) {
        String normalizedAlias = normalize(alias);
        return Pattern.compile(
                "(?<!" + TOKEN_BOUNDARY + ")" + Pattern.quote(normalizedAlias) + "(?!" + TOKEN_BOUNDARY + ")",
                Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE
        );
    }

    private static String normalize(String value) {
        return Normalizer.normalize(value, Normalizer.Form.NFKC)
                .toLowerCase(Locale.ROOT)
                .replaceAll("\\s+", " ")
                .trim();
    }

    private record SkillDefinition(String name, List<Pattern> aliasPatterns) {
    }

    private record DetectedAlias(int skillIndex, int start, int end) {

        int length() {
            return end - start;
        }

        boolean overlaps(DetectedAlias other) {
            return start < other.end && other.start < end;
        }
    }
}
