# Performance Dashboard

## 1. Project Description
An internal performance dashboard for coaching teams. Displays key learner engagement metrics, submission tracking, OTJH risk indicators, evidence progress, and case owner info. Target users are coaches and team leads who need a quick visual read of learner performance at-a-glance.

## 2. Page Structure
- `/` - Main Dashboard (single-page application)

## 3. Core Features
- [x] Hero header with summary stats
- [x] KPI cards (Total Learners, Recent Submitters, Elapsed Days, Learner Engagement)
- [x] OTJH Risk Indicator panel (OnTrack / Need Attention / At Risk)
- [x] Pending & Marking Progress metrics
- [x] Evidence tracking section (Accepted, Referred, Closure, Total)
- [x] Full data table with all 20 columns

## 4. Data Model Design
No backend needed. Mock data stored in `src/mocks/dashboard.ts`.

## 5. Backend / Third-party Integration Plan
- Supabase: Not needed for Phase 1 (mock data)
- Shopify: Not needed
- Stripe: Not needed

## 6. Development Phase Plan

### Phase 1: Dashboard UI with mock data
- Goal: Build the full visual dashboard with mock data
- Deliverable: A working, visually striking single-page dashboard
