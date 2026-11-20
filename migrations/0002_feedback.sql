-- 0002_feedback.sql: site feedback (bug / idea / suggestion) for the team and its agents.
-- Raw messages stay here (private). The triage agent posts only cleaned summaries to the public repo.
create table if not exists "feedback" (
  "id" text not null primary key,
  "kind" text not null check ("kind" in ('bug','idea','suggestion')),
  "message" text not null,
  "page" text,
  "skin" text,
  "status" text not null default 'new' check ("status" in ('new','triaged','planned','done','wontfix','spam','duplicate')),
  "agentNote" text,
  "ref" text,
  "createdAt" text not null,
  "updatedAt" text not null
);
create index if not exists "feedback_status_idx" on "feedback" ("status", "createdAt");
-- Abuse limit: one row per salted IP hash per hour window; no raw IPs stored.
create table if not exists "feedbackLimit" ("key" text not null primary key, "count" integer not null, "windowStart" integer not null);
