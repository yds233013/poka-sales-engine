-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('SALES_REP', 'SALES_MANAGER', 'APPLICATION_ENGINEER', 'ADMIN');

-- CreateEnum
CREATE TYPE "CustomerTier" AS ENUM ('STRATEGIC', 'KEY', 'STANDARD', 'TRANSACTIONAL');

-- CreateEnum
CREATE TYPE "LifecycleStatus" AS ENUM ('ACTIVE', 'MATURE', 'END_OF_LIFE', 'DISCONTINUED');

-- CreateEnum
CREATE TYPE "SpecType" AS ENUM ('NUMERIC', 'RANGE', 'ENUM', 'BOOLEAN', 'TEXT');

-- CreateEnum
CREATE TYPE "SubstitutionKind" AS ENUM ('DIRECT_REPLACEMENT', 'SUCCESSOR', 'UPGRADE', 'ALTERNATE', 'ACCESSORY_REQUIRED');

-- CreateEnum
CREATE TYPE "RuleSeverity" AS ENUM ('HARD', 'SOFT');

-- CreateEnum
CREATE TYPE "RuleOperator" AS ENUM ('GTE', 'LTE', 'EQ', 'NEQ', 'INCLUDES', 'WITHIN_TOLERANCE');

-- CreateEnum
CREATE TYPE "DocType" AS ENUM ('SPEC_SHEET', 'INSTALLATION_GUIDE', 'COMPATIBILITY_NOTE', 'REPLACEMENT_GUIDE', 'TECHNICAL_BULLETIN', 'SAFETY_NOTICE');

-- CreateEnum
CREATE TYPE "FreightService" AS ENUM ('GROUND', 'EXPEDITED', 'AIR');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('NEW', 'ANALYZING', 'NEEDS_REVIEW', 'READY_FOR_APPROVAL', 'APPROVED', 'RESPONSE_READY', 'COMPLETED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "RiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'BLOCKED');

-- CreateEnum
CREATE TYPE "RequestChannel" AS ENUM ('EMAIL', 'PORTAL', 'PHONE', 'EDI');

-- CreateEnum
CREATE TYPE "RequirementKind" AS ENUM ('EXPLICIT', 'INFERRED', 'AMBIGUOUS', 'MISSING');

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED', 'HALTED_FOR_APPROVAL');

-- CreateEnum
CREATE TYPE "ModelSource" AS ENUM ('NONE', 'SCRIPTED', 'LIVE');

-- CreateEnum
CREATE TYPE "ExecutionMode" AS ENUM ('DETERMINISTIC', 'ADAPTIVE_AGENT');

-- CreateEnum
CREATE TYPE "TerminationStatus" AS ENUM ('INFORMATION_PROVIDED', 'COMPLETED', 'READY_FOR_APPROVAL', 'READY_TO_DRAFT', 'NEEDS_CUSTOMER_CLARIFICATION', 'NEEDS_INTERNAL_REVIEW', 'BLOCKED_TECHNICAL', 'GUARDRAIL_STOP', 'FAILED');

-- CreateEnum
CREATE TYPE "ToolStatus" AS ENUM ('OK', 'EMPTY', 'ERROR', 'BLOCKED');

-- CreateEnum
CREATE TYPE "SafetyClass" AS ENUM ('AUTO_SAFE', 'NEEDS_REVIEW', 'BLOCKED');

-- CreateEnum
CREATE TYPE "ToolEffect" AS ENUM ('READ_ONLY', 'DETERMINISTIC_COMPUTATION', 'MUTATION', 'HUMAN_GATED_MUTATION');

-- CreateEnum
CREATE TYPE "RecommendationOutcome" AS ENUM ('EXACT_MATCH', 'SUBSTITUTE', 'SPLIT_FULFILLMENT', 'NO_VIABLE_OPTION', 'INFORMATION_REQUIRED', 'INFORMATION_PROVIDED');

-- CreateEnum
CREATE TYPE "CandidateVerdict" AS ENUM ('RECOMMENDED', 'VIABLE', 'REJECTED', 'REQUIRES_REVIEW');

-- CreateEnum
CREATE TYPE "CheckResult" AS ENUM ('PASS', 'FAIL', 'WARNING', 'UNKNOWN', 'NOT_APPLICABLE');

-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'SENT', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CHANGES_REQUESTED');

-- CreateEnum
CREATE TYPE "ApprovalKind" AS ENUM ('DELIVERY_DATE_MISS', 'DISCOUNT_THRESHOLD', 'MARGIN_FLOOR', 'TECHNICAL_SUBSTITUTION', 'COMPATIBILITY_WARNING', 'EXPEDITED_FREIGHT', 'LARGE_QUOTE_VALUE', 'TECHNICAL_UNCERTAINTY', 'SPLIT_FULFILLMENT');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "title" TEXT NOT NULL,
    "initials" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "industry" TEXT NOT NULL,
    "tier" "CustomerTier" NOT NULL,
    "paymentTerms" INTEGER NOT NULL,
    "creditLimit" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "priceBookId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_sites" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "aliases" TEXT[],
    "addressLine1" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "postalCode" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'US',
    "freightZone" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "customer_sites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contacts" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "siteId" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "jobTitle" TEXT NOT NULL,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_categories" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "family" TEXT NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "product_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "lifecycle" "LifecycleStatus" NOT NULL DEFAULT 'ACTIVE',
    "leadTimeDays" INTEGER NOT NULL,
    "listPrice" DECIMAL(12,2) NOT NULL,
    "standardCost" DECIMAL(12,2) NOT NULL,
    "weightKg" DECIMAL(10,2) NOT NULL,
    "isAccessory" BOOLEAN NOT NULL DEFAULT false,
    "hazmat" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_specs" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" "SpecType" NOT NULL,
    "numValue" DECIMAL(14,4),
    "minValue" DECIMAL(14,4),
    "maxValue" DECIMAL(14,4),
    "textValue" TEXT,
    "boolValue" BOOLEAN,
    "unit" TEXT,

    CONSTRAINT "product_specs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "substitution_links" (
    "id" TEXT NOT NULL,
    "fromProductId" TEXT NOT NULL,
    "toProductId" TEXT NOT NULL,
    "kind" "SubstitutionKind" NOT NULL,
    "note" TEXT NOT NULL,
    "requiresSku" TEXT,

    CONSTRAINT "substitution_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accessory_links" (
    "id" TEXT NOT NULL,
    "hostId" TEXT NOT NULL,
    "accessoryId" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT NOT NULL,

    CONSTRAINT "accessory_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compatibility_rules" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "dimension" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "specKey" TEXT NOT NULL,
    "requirementKey" TEXT NOT NULL,
    "operator" "RuleOperator" NOT NULL,
    "severity" "RuleSeverity" NOT NULL,
    "tolerancePct" DECIMAL(6,2),
    "appliesTo" TEXT[],
    "explanation" TEXT NOT NULL,

    CONSTRAINT "compatibility_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "technical_documents" (
    "id" TEXT NOT NULL,
    "docNumber" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" "DocType" NOT NULL,
    "revision" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "productId" TEXT,
    "families" TEXT[],
    "summary" TEXT NOT NULL,

    CONSTRAINT "technical_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_sections" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "anchor" TEXT NOT NULL,
    "heading" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,

    CONSTRAINT "document_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warehouses" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'US',
    "freightZone" TEXT NOT NULL,
    "handlingDays" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "warehouses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "onHand" INTEGER NOT NULL,
    "reserved" INTEGER NOT NULL DEFAULT 0,
    "safetyStock" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "inventory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incoming_shipments" (
    "id" TEXT NOT NULL,
    "inventoryId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "expectedAt" TIMESTAMP(3) NOT NULL,
    "poNumber" TEXT NOT NULL,
    "confirmed" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "incoming_shipments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_books" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "defaultDiscountPct" DECIMAL(6,2) NOT NULL,

    CONSTRAINT "price_books_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_book_entries" (
    "id" TEXT NOT NULL,
    "priceBookId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "discountPct" DECIMAL(6,2) NOT NULL,

    CONSTRAINT "price_book_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_pricing" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "contractPrice" DECIMAL(12,2) NOT NULL,
    "contractRef" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_pricing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discount_rules" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "categoryCode" TEXT,
    "minQty" INTEGER NOT NULL,
    "discountPct" DECIMAL(6,2) NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "discount_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "freight_rules" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "originZone" TEXT NOT NULL,
    "destZone" TEXT NOT NULL,
    "service" "FreightService" NOT NULL,
    "baseCharge" DECIMAL(10,2) NOT NULL,
    "perKg" DECIMAL(10,4) NOT NULL,
    "transitDays" INTEGER NOT NULL,
    "hazmatSurcharge" DECIMAL(10,2) NOT NULL DEFAULT 0,

    CONSTRAINT "freight_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "policy_thresholds" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "numericValue" DECIMAL(12,2) NOT NULL,
    "unit" TEXT NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "policy_thresholds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_requests" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "rawBody" TEXT NOT NULL,
    "channel" "RequestChannel" NOT NULL DEFAULT 'EMAIL',
    "status" "RequestStatus" NOT NULL DEFAULT 'NEW',
    "risk" "RiskLevel" NOT NULL DEFAULT 'LOW',
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "requiredBy" TIMESTAMP(3),
    "customerId" TEXT,
    "siteId" TEXT,
    "contactId" TEXT,
    "ownerId" TEXT,
    "summary" TEXT,
    "blockedReason" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "request_items" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "rawText" TEXT NOT NULL,
    "productId" TEXT,
    "quantity" INTEGER NOT NULL,
    "lineNumber" INTEGER NOT NULL,

    CONSTRAINT "request_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "requirements" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "kind" "RequirementKind" NOT NULL,
    "operator" "RuleOperator",
    "numValue" DECIMAL(14,4),
    "textValue" TEXT,
    "unit" TEXT,
    "sourceQuote" TEXT,
    "confidence" DECIMAL(4,3) NOT NULL,
    "note" TEXT,

    CONSTRAINT "requirements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_runs" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "status" "RunStatus" NOT NULL DEFAULT 'RUNNING',
    "mode" "ExecutionMode" NOT NULL DEFAULT 'DETERMINISTIC',
    "provider" TEXT NOT NULL,
    "model" TEXT,
    "modelSource" "ModelSource" NOT NULL DEFAULT 'NONE',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "error" TEXT,
    "errorCategory" TEXT,
    "trace" JSONB,
    "termination" "TerminationStatus",
    "turnCount" INTEGER,
    "toolCallCount" INTEGER,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "cacheWriteTokens" INTEGER,
    "cacheReadTokens" INTEGER,
    "estimatedCostUsd" DECIMAL(10,6),
    "outcome" JSONB,
    "guardrailEvents" JSONB,
    "groundingIssues" TEXT[],

    CONSTRAINT "agent_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tool_calls" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "toolName" TEXT NOT NULL,
    "input" JSONB NOT NULL,
    "output" JSONB,
    "status" "ToolStatus" NOT NULL,
    "safety" "SafetyClass" NOT NULL DEFAULT 'AUTO_SAFE',
    "effect" "ToolEffect" NOT NULL DEFAULT 'READ_ONLY',
    "modelInitiated" BOOLEAN NOT NULL DEFAULT false,
    "summary" TEXT NOT NULL,
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "durationMs" INTEGER NOT NULL,

    CONSTRAINT "tool_calls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evidence" (
    "id" TEXT NOT NULL,
    "toolCallId" TEXT,
    "candidateId" TEXT,
    "recommendationId" TEXT,
    "kind" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "claim" TEXT NOT NULL,
    "sectionId" TEXT,
    "recordRef" TEXT,

    CONSTRAINT "evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recommendations" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "outcome" "RecommendationOutcome" NOT NULL,
    "headline" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "risk" "RiskLevel" NOT NULL,
    "productId" TEXT,
    "quantity" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recommendation_candidates" (
    "id" TEXT NOT NULL,
    "recommendationId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "verdict" "CandidateVerdict" NOT NULL,
    "rank" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "score" DECIMAL(6,2) NOT NULL,
    "unitPrice" DECIMAL(12,2),
    "availableQty" INTEGER,
    "earliestShipDate" TIMESTAMP(3),

    CONSTRAINT "recommendation_candidates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidate_checks" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "dimension" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "result" "CheckResult" NOT NULL,
    "severity" "RuleSeverity" NOT NULL,
    "requirement" TEXT NOT NULL,
    "actual" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "ruleCode" TEXT,

    CONSTRAINT "candidate_checks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotes" (
    "id" TEXT NOT NULL,
    "quoteNumber" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "status" "QuoteStatus" NOT NULL DEFAULT 'DRAFT',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "subtotal" DECIMAL(14,2) NOT NULL,
    "discountTotal" DECIMAL(14,2) NOT NULL,
    "freightCost" DECIMAL(14,2) NOT NULL,
    "freightService" "FreightService" NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,
    "costTotal" DECIMAL(14,2) NOT NULL,
    "marginAmount" DECIMAL(14,2) NOT NULL,
    "marginPct" DECIMAL(6,2) NOT NULL,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "estimatedDelivery" TIMESTAMP(3),
    "terms" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote_items" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "listPrice" DECIMAL(12,2) NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "discountPct" DECIMAL(6,2) NOT NULL,
    "priceSource" TEXT NOT NULL,
    "extended" DECIMAL(14,2) NOT NULL,
    "unitCost" DECIMAL(12,2) NOT NULL,
    "leadTimeDays" INTEGER NOT NULL,
    "allocations" JSONB NOT NULL,

    CONSTRAINT "quote_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approvals" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "quoteId" TEXT,
    "kind" "ApprovalKind" NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "requiredRole" "UserRole" NOT NULL,
    "title" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "proposedAction" TEXT NOT NULL,
    "commercialImpact" TEXT NOT NULL,
    "technicalImpact" TEXT NOT NULL,
    "riskNote" TEXT NOT NULL,
    "context" JSONB NOT NULL,
    "requestedById" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_responses" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "edited" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "actorId" TEXT,
    "summary" TEXT NOT NULL,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "customers_accountNumber_key" ON "customers"("accountNumber");

-- CreateIndex
CREATE INDEX "customers_name_idx" ON "customers"("name");

-- CreateIndex
CREATE INDEX "customer_sites_customerId_idx" ON "customer_sites"("customerId");

-- CreateIndex
CREATE INDEX "contacts_customerId_idx" ON "contacts"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "product_categories_code_key" ON "product_categories"("code");

-- CreateIndex
CREATE UNIQUE INDEX "products_sku_key" ON "products"("sku");

-- CreateIndex
CREATE INDEX "products_categoryId_idx" ON "products"("categoryId");

-- CreateIndex
CREATE INDEX "product_specs_key_idx" ON "product_specs"("key");

-- CreateIndex
CREATE UNIQUE INDEX "product_specs_productId_key_key" ON "product_specs"("productId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "substitution_links_fromProductId_toProductId_key" ON "substitution_links"("fromProductId", "toProductId");

-- CreateIndex
CREATE UNIQUE INDEX "accessory_links_hostId_accessoryId_key" ON "accessory_links"("hostId", "accessoryId");

-- CreateIndex
CREATE UNIQUE INDEX "compatibility_rules_code_key" ON "compatibility_rules"("code");

-- CreateIndex
CREATE UNIQUE INDEX "technical_documents_docNumber_key" ON "technical_documents"("docNumber");

-- CreateIndex
CREATE INDEX "technical_documents_type_idx" ON "technical_documents"("type");

-- CreateIndex
CREATE UNIQUE INDEX "document_sections_documentId_anchor_key" ON "document_sections"("documentId", "anchor");

-- CreateIndex
CREATE UNIQUE INDEX "warehouses_code_key" ON "warehouses"("code");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_productId_warehouseId_key" ON "inventory"("productId", "warehouseId");

-- CreateIndex
CREATE INDEX "incoming_shipments_inventoryId_idx" ON "incoming_shipments"("inventoryId");

-- CreateIndex
CREATE UNIQUE INDEX "price_books_code_key" ON "price_books"("code");

-- CreateIndex
CREATE UNIQUE INDEX "price_book_entries_priceBookId_productId_key" ON "price_book_entries"("priceBookId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "customer_pricing_customerId_productId_key" ON "customer_pricing"("customerId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "discount_rules_code_key" ON "discount_rules"("code");

-- CreateIndex
CREATE UNIQUE INDEX "freight_rules_code_key" ON "freight_rules"("code");

-- CreateIndex
CREATE UNIQUE INDEX "freight_rules_originZone_destZone_service_key" ON "freight_rules"("originZone", "destZone", "service");

-- CreateIndex
CREATE UNIQUE INDEX "policy_thresholds_code_key" ON "policy_thresholds"("code");

-- CreateIndex
CREATE UNIQUE INDEX "sales_requests_reference_key" ON "sales_requests"("reference");

-- CreateIndex
CREATE INDEX "sales_requests_status_idx" ON "sales_requests"("status");

-- CreateIndex
CREATE INDEX "sales_requests_customerId_idx" ON "sales_requests"("customerId");

-- CreateIndex
CREATE INDEX "request_items_requestId_idx" ON "request_items"("requestId");

-- CreateIndex
CREATE INDEX "requirements_requestId_idx" ON "requirements"("requestId");

-- CreateIndex
CREATE INDEX "agent_runs_requestId_idx" ON "agent_runs"("requestId");

-- CreateIndex
CREATE INDEX "agent_runs_mode_idx" ON "agent_runs"("mode");

-- CreateIndex
CREATE INDEX "tool_calls_runId_idx" ON "tool_calls"("runId");

-- CreateIndex
CREATE INDEX "recommendations_requestId_idx" ON "recommendations"("requestId");

-- CreateIndex
CREATE INDEX "recommendation_candidates_recommendationId_idx" ON "recommendation_candidates"("recommendationId");

-- CreateIndex
CREATE INDEX "candidate_checks_candidateId_idx" ON "candidate_checks"("candidateId");

-- CreateIndex
CREATE UNIQUE INDEX "quotes_quoteNumber_key" ON "quotes"("quoteNumber");

-- CreateIndex
CREATE INDEX "quotes_requestId_idx" ON "quotes"("requestId");

-- CreateIndex
CREATE INDEX "quote_items_quoteId_idx" ON "quote_items"("quoteId");

-- CreateIndex
CREATE INDEX "approvals_requestId_idx" ON "approvals"("requestId");

-- CreateIndex
CREATE INDEX "approvals_status_idx" ON "approvals"("status");

-- CreateIndex
CREATE INDEX "customer_responses_requestId_idx" ON "customer_responses"("requestId");

-- CreateIndex
CREATE INDEX "audit_events_requestId_idx" ON "audit_events"("requestId");

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_priceBookId_fkey" FOREIGN KEY ("priceBookId") REFERENCES "price_books"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_sites" ADD CONSTRAINT "customer_sites_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "customer_sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "product_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_specs" ADD CONSTRAINT "product_specs_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "substitution_links" ADD CONSTRAINT "substitution_links_fromProductId_fkey" FOREIGN KEY ("fromProductId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "substitution_links" ADD CONSTRAINT "substitution_links_toProductId_fkey" FOREIGN KEY ("toProductId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accessory_links" ADD CONSTRAINT "accessory_links_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accessory_links" ADD CONSTRAINT "accessory_links_accessoryId_fkey" FOREIGN KEY ("accessoryId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "technical_documents" ADD CONSTRAINT "technical_documents_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_sections" ADD CONSTRAINT "document_sections_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "technical_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incoming_shipments" ADD CONSTRAINT "incoming_shipments_inventoryId_fkey" FOREIGN KEY ("inventoryId") REFERENCES "inventory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_book_entries" ADD CONSTRAINT "price_book_entries_priceBookId_fkey" FOREIGN KEY ("priceBookId") REFERENCES "price_books"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_book_entries" ADD CONSTRAINT "price_book_entries_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_pricing" ADD CONSTRAINT "customer_pricing_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_pricing" ADD CONSTRAINT "customer_pricing_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_requests" ADD CONSTRAINT "sales_requests_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_requests" ADD CONSTRAINT "sales_requests_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "customer_sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_requests" ADD CONSTRAINT "sales_requests_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_requests" ADD CONSTRAINT "sales_requests_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_items" ADD CONSTRAINT "request_items_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "sales_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_items" ADD CONSTRAINT "request_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirements" ADD CONSTRAINT "requirements_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "sales_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "sales_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tool_calls" ADD CONSTRAINT "tool_calls_runId_fkey" FOREIGN KEY ("runId") REFERENCES "agent_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_toolCallId_fkey" FOREIGN KEY ("toolCallId") REFERENCES "tool_calls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "document_sections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "recommendation_candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_recommendationId_fkey" FOREIGN KEY ("recommendationId") REFERENCES "recommendations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "sales_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendation_candidates" ADD CONSTRAINT "recommendation_candidates_recommendationId_fkey" FOREIGN KEY ("recommendationId") REFERENCES "recommendations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendation_candidates" ADD CONSTRAINT "recommendation_candidates_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_checks" ADD CONSTRAINT "candidate_checks_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "recommendation_candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "sales_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "customer_sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "sales_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_responses" ADD CONSTRAINT "customer_responses_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "sales_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "sales_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

