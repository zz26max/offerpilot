package net.jrodolfo.jobportal.service;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;

class TechnicalSkillMatcherTest {

    private final TechnicalSkillMatcher matcher = new TechnicalSkillMatcher();

    @Test
    void exposesTheExplicitVersionOneDictionaryInStableOrder() {
        assertEquals(List.of(
                "Java", "Spring Boot", "MySQL", "Redis", "RabbitMQ", "Docker", "Kubernetes", "Kafka",
                "Elasticsearch", "Git", "Maven", "Gradle", "JUnit", "Mockito", "REST API", "Microservices",
                "React", "Vue", "TypeScript", "JavaScript", "HTML", "CSS", "AWS"
        ), TechnicalSkillMatcher.supportedSkills());
    }

    @Test
    void recognizesAliasesCaseAndUnicodeNormalizationNextToChineseText() {
        assertEquals(
                List.of("Java", "Spring Boot", "Kubernetes", "REST API", "React", "AWS"),
                matcher.findSkills("熟悉ＪＡＶＡ、SPRINGBOOT、k8s、RESTful APIs、React.js 与 Amazon Web Services。")
        );
    }

    @Test
    void doesNotMatchJavaInsideJavaScriptOrSkillsInsideLongerLatinWords() {
        assertEquals(
                List.of("JavaScript"),
                matcher.findSkills("JavaScript, Java Script and Java-Script; redistribution dockerized mySQLish github")
        );
    }

    @Test
    void returnsNoSkillsForMissingOrUnrecognizedText() {
        assertEquals(List.of(), matcher.findSkills(null));
        assertEquals(List.of(), matcher.findSkills("  \n "));
        assertEquals(List.of(), matcher.findSkills("沟通能力与产品思维"));
    }
}
