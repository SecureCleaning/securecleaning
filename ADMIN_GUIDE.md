# Secure Cleaning Admin Guide

## Overview
The admin area is designed to support day-to-day operation of Secure Cleaning:
- review quotes
- manage bookings
- assign sites
- assign owner-operators
- schedule inspections
- update website content/pricing/availability

## Main sections

### Overview
Use this for a quick snapshot of:
- reporting metrics
- pending quotes
- pending bookings
- leads
- active operators

### Sites
Use `/admin/sites` to:
- create site records
- edit site details
- store keyholder, alarm, induction, and access notes
- review site notes snapshots from the main admin overview

### Bookings
Use the Bookings tab to:
- review the dispatch board
- review overdue inspection actions
- update booking status
- assign a site
- assign an operator
- resend confirmation
- edit booking details
- manage inspection workflow

### Operators
Use the Operators tab to:
- review active/verified operators
- inspect city and premises-type fit

### Settings
Use Settings for:
- content updates
- pricing config
- availability config
- recent audit log review

## Suggested operating flow
1. New quote arrives
2. Quote is reviewed / followed up
3. Client books
4. Confirm site linkage or create/edit site record
5. Assign suitable owner-operator
6. Schedule inspection
7. Update inspection status as it progresses
8. Confirm first clean and continue service delivery

## Current limitations
- Admin auth is still password/cookie based, not full user auth
- Operator assignment is scaffolded, not a full dispatch engine
- Inspection workflow is tracked, but not yet a full calendar/board system
- Audit log exists, but is still lightweight

## Recommended next production improvements
- proper user auth and roles
- automated notifications for new quotes/bookings
- dedicated dispatch board
- richer notes and tasking system
- test coverage and deployment automation
