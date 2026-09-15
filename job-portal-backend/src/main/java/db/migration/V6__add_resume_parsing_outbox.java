package db.migration;

import org.flywaydb.core.api.migration.BaseJavaMigration;
import org.flywaydb.core.api.migration.Context;

import java.sql.Connection;
import java.sql.Statement;
import java.util.Locale;

/**
 * Adds durable resume parsing state and the transactional outbox. The text
 * type is selected per database because MySQL uses LONGTEXT while H2 exposes
 * its large character type as CLOB to Hibernate schema validation.
 */
public class V6__add_resume_parsing_outbox extends BaseJavaMigration {

    @Override
    public void migrate(Context context) throws Exception {
        Connection connection = context.getConnection();
        boolean mysql = connection.getMetaData()
                .getDatabaseProductName()
                .toLowerCase(Locale.ROOT)
                .contains("mysql");

        execute(connection, "ALTER TABLE resumes ADD COLUMN parse_status VARCHAR(32) NOT NULL DEFAULT 'UPLOADED'");
        execute(connection, "ALTER TABLE resumes ADD COLUMN parse_attempts INT NOT NULL DEFAULT 0");
        execute(connection, "ALTER TABLE resumes ADD COLUMN extracted_text " + (mysql ? "LONGTEXT" : "CLOB") + " NULL");
        execute(connection, "ALTER TABLE resumes ADD COLUMN error_code VARCHAR(64) NULL");
        execute(connection, "ALTER TABLE resumes ADD COLUMN error_summary VARCHAR(255) NULL");
        execute(connection, "ALTER TABLE resumes ADD COLUMN parsed_at TIMESTAMP(6) NULL");

        execute(connection, """
                CREATE TABLE resume_outbox (
                    id BIGINT AUTO_INCREMENT PRIMARY KEY,
                    event_id VARCHAR(36) NOT NULL,
                    resume_id BIGINT NOT NULL,
                    event_type VARCHAR(64) NOT NULL,
                    schema_version INT NOT NULL,
                    status VARCHAR(32) NOT NULL,
                    attempt_count INT NOT NULL DEFAULT 0,
                    available_at TIMESTAMP(6) NOT NULL,
                    locked_until TIMESTAMP(6) NULL,
                    locked_by VARCHAR(64) NULL,
                    created_at TIMESTAMP(6) NOT NULL,
                    published_at TIMESTAMP(6) NULL,
                    last_error VARCHAR(255) NULL,
                    CONSTRAINT uk_resume_outbox_event_id UNIQUE (event_id),
                    CONSTRAINT fk_resume_outbox_resume FOREIGN KEY (resume_id) REFERENCES resumes (id)
                )
                """);
        execute(connection, "CREATE INDEX idx_resume_outbox_pending ON resume_outbox (status, available_at, id)");
    }

    private void execute(Connection connection, String sql) throws Exception {
        try (Statement statement = connection.createStatement()) {
            statement.execute(sql);
        }
    }
}
