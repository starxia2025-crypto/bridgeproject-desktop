CREATE TABLE IF NOT EXISTS `QA_releases` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `code` VARCHAR(64) NOT NULL,
  `product_name` VARCHAR(255) NOT NULL,
  `version_label` VARCHAR(120) NOT NULL,
  `release_date` DATETIME(3) NULL,
  `environment_name` VARCHAR(120) NULL DEFAULT 'preproduccion',
  `status` VARCHAR(40) NOT NULL DEFAULT 'draft',
  `scope_summary` LONGTEXT NULL,
  `release_notes` LONGTEXT NULL,
  `created_by_user_id` INT NOT NULL,
  `approved_by_user_id` INT NULL,
  `approved_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_qa_release_code` (`code`),
  CONSTRAINT `fk_qa_release_created_by` FOREIGN KEY (`created_by_user_id`) REFERENCES `SOP_users` (`id`),
  CONSTRAINT `fk_qa_release_approved_by` FOREIGN KEY (`approved_by_user_id`) REFERENCES `SOP_users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `QA_release_sections` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `release_id` INT NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `description` LONGTEXT NULL,
  `sort_order` INT NOT NULL DEFAULT 0,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `idx_qa_section_release` (`release_id`),
  CONSTRAINT `fk_qa_section_release` FOREIGN KEY (`release_id`) REFERENCES `QA_releases` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `QA_test_cases` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `release_id` INT NOT NULL,
  `section_id` INT NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `objective` LONGTEXT NULL,
  `steps_text` LONGTEXT NULL,
  `expected_result` LONGTEXT NULL,
  `priority` VARCHAR(40) NOT NULL DEFAULT 'medium',
  `status` VARCHAR(40) NOT NULL DEFAULT 'pending',
  `assigned_to_user_id` INT NULL,
  `assigned_at` DATETIME(3) NULL,
  `execution_order` INT NOT NULL DEFAULT 0,
  `created_by_user_id` INT NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `idx_qa_case_release` (`release_id`),
  KEY `idx_qa_case_section` (`section_id`),
  KEY `idx_qa_case_assigned` (`assigned_to_user_id`),
  CONSTRAINT `fk_qa_case_release` FOREIGN KEY (`release_id`) REFERENCES `QA_releases` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_qa_case_section` FOREIGN KEY (`section_id`) REFERENCES `QA_release_sections` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_qa_case_assigned_to` FOREIGN KEY (`assigned_to_user_id`) REFERENCES `SOP_users` (`id`),
  CONSTRAINT `fk_qa_case_created_by` FOREIGN KEY (`created_by_user_id`) REFERENCES `SOP_users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `QA_test_results` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `release_id` INT NOT NULL,
  `case_id` INT NOT NULL,
  `executed_by_user_id` INT NOT NULL,
  `outcome` VARCHAR(40) NOT NULL,
  `notes` LONGTEXT NULL,
  `actual_result` LONGTEXT NULL,
  `bug_title` VARCHAR(255) NULL,
  `bug_severity` VARCHAR(40) NULL,
  `executed_at` DATETIME(3) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `idx_qa_result_release` (`release_id`),
  KEY `idx_qa_result_case` (`case_id`),
  KEY `idx_qa_result_executed_by` (`executed_by_user_id`),
  CONSTRAINT `fk_qa_result_release` FOREIGN KEY (`release_id`) REFERENCES `QA_releases` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_qa_result_case` FOREIGN KEY (`case_id`) REFERENCES `QA_test_cases` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_qa_result_executed_by` FOREIGN KEY (`executed_by_user_id`) REFERENCES `SOP_users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `QA_test_evidences` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `result_id` INT NOT NULL,
  `file_name` VARCHAR(255) NOT NULL,
  `stored_file_name` VARCHAR(255) NOT NULL,
  `mime_type` VARCHAR(160) NOT NULL,
  `file_size` INT NOT NULL DEFAULT 0,
  `public_url` VARCHAR(1000) NOT NULL,
  `evidence_type` VARCHAR(40) NOT NULL DEFAULT 'other',
  `created_by_user_id` INT NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `idx_qa_evidence_result` (`result_id`),
  KEY `idx_qa_evidence_created_by` (`created_by_user_id`),
  CONSTRAINT `fk_qa_evidence_result` FOREIGN KEY (`result_id`) REFERENCES `QA_test_results` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_qa_evidence_created_by` FOREIGN KEY (`created_by_user_id`) REFERENCES `SOP_users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
