package db.migration;

import org.flywaydb.core.api.migration.BaseJavaMigration;
import org.flywaydb.core.api.migration.Context;

import java.sql.Connection;
import java.sql.Statement;
import java.util.Locale;

/**
 * Aligns H2's test schema with the LONGVARCHAR mapping used by MySQL LONGTEXT.
 * MySQL databases that already applied V6 keep their capacity-preserving
 * LONGTEXT column unchanged.
 */
public class V7__align_resume_extracted_text_jdbc_type extends BaseJavaMigration {

    @Override
    public void migrate(Context context) throws Exception {
        Connection connection = context.getConnection();
        boolean mysql = connection.getMetaData()
                .getDatabaseProductName()
                .toLowerCase(Locale.ROOT)
                .contains("mysql");
        if (mysql) {
            return;
        }

        try (Statement statement = connection.createStatement()) {
            statement.execute("ALTER TABLE resumes ALTER COLUMN extracted_text LONGVARCHAR NULL");
        }
    }
}
