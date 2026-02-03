# PM Approval Workflow — Mobile Implementation Plan

## Overview
- Target platforms: React Native (mobile) with React Native Paper or Tamagui; Web parity via Shadcn UI + Tailwind.
- Environments: Vite + React for web; Node.js + Express backend with Prisma/Sequelize ORM.
- Goal: Deliver end-to-end PM approval workflow on mobile with role-gated actions, approval inbox, notifications, and audit trail.

## Phase 1 — Technician Submission
- UX Flow
  - Technician completes PM checklist and submits task for approval from Task Detail.
  - Disabled when task is already in PendingSupervisor, PendingSuperadmin, or Approved.
- Mobile Component Tree (React Native)
  - App
  - NavigationStack
  - TaskDetailPage
    - Header
    - ChecklistList
    - EvidenceList
    - SubmitForApprovalButton
- Web Parity (Shadcn UI)
  - TaskDetailDialog
    - Tabs
    - ChecklistSection
    - EvidenceSection
    - SubmitForApprovalButton
- Sample Mobile Code (React Native Paper)

```tsx
import React from "react";
import { Button } from "react-native-paper";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { submitTaskForApproval } from "../lib/api";

type Props = { taskId: string; disabled: boolean };

export function SubmitForApprovalButton({ taskId, disabled }: Props) {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: () => submitTaskForApproval(taskId),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["task", taskId] });
    },
  });
  return (
    <Button mode="contained" disabled={disabled || m.isPending} onPress={() => m.mutate()}>
      Submit for Approval
    </Button>
  );
}
```

- Backend Endpoint Definition
  - POST /api/tasks/{taskId}/submit-for-approval
  - Transitions approvalStatus: None → PendingSupervisor; records technician completion trail.
- Sample Express Route

```ts
import { Router } from "express";

export const approvalsRouter = Router();

approvalsRouter.post("/tasks/:taskId/submit-for-approval", async (req, res) => {
  const taskId = req.params.taskId;
  res.json({ ok: true, taskId });
});
```

## Phase 2 — Supervisor Review
- UX Flow
  - Supervisor reviews PendingSupervisor tasks in an Approvals Inbox.
  - Actions: Approve (moves to PendingSuperadmin), Reject (optional reopen).
- Mobile Component Tree
  - ApprovalsPage
    - Tabs: PendingSupervisor, PendingSuperadmin, Mine, All
    - ApprovalList
      - ApprovalItem
        - ApproveButton
        - RejectButton
- Web Parity
  - ApprovalsInboxPage
    - Tabs
    - DataTable
    - Row actions with Shadcn Button and Dialog
- Sample Mobile Code (Tamamgui or Paper)

```tsx
import React from "react";
import { FlatList, View } from "react-native";
import { Button, Card, Text } from "react-native-paper";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listApprovals, approveBySupervisor, rejectApproval } from "../lib/api";

type Approval = { id: string; taskNumber: string; title: string };

export function ApprovalsPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["approvals", "supervisor"], queryFn: () => listApprovals({ stage: "PendingSupervisor" }) });
  const approve = useMutation({
    mutationFn: (id: string) => approveBySupervisor(id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["approvals", "supervisor"] });
    },
  });
  const reject = useMutation({
    mutationFn: (id: string) => rejectApproval(id, { reopen: false }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["approvals", "supervisor"] });
    },
  });
  return (
    <FlatList
      data={(q.data ?? []) as Approval[]}
      keyExtractor={(i) => i.id}
      renderItem={({ item }) => (
        <Card style={{ marginBottom: 12 }}>
          <Card.Title title={item.title} subtitle={item.taskNumber} />
          <Card.Actions>
            <Button onPress={() => approve.mutate(item.id)}>Approve</Button>
            <Button onPress={() => reject.mutate(item.id)}>Reject</Button>
          </Card.Actions>
        </Card>
      )}
      ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
    />
  );
}
```

- Backend Endpoints
  - GET /api/approvals?stage=PendingSupervisor
  - POST /api/tasks/{taskId}/approve-by-supervisor
  - POST /api/tasks/{taskId}/reject-approval

## Phase 3 — Superadmin Approval
- UX Flow
  - Superadmin approves PendingSuperadmin tasks; finalizes approval and sets Approved.
- Mobile Component Tree
  - ApprovalsPage
    - Tabs: PendingSuperadmin
    - ApprovalList with Approve and Reject
- Backend Endpoints
  - GET /api/approvals?stage=PendingSuperadmin
  - POST /api/tasks/{taskId}/approve-by-superadmin
  - POST /api/tasks/{taskId}/reject-approval

## Phase 4 — Notifications and Audit
- Device Registration
  - Mobile registers push token and associates it with the user.
- Sample Mobile Code (Capacitor Push)

```ts
import { PushNotifications } from "@capacitor/push-notifications";

export async function registerDevice(userId: string) {
  await PushNotifications.register();
}
```

- Backend Endpoints
  - POST /api/notifications/devices
  - Approval transition events: task_approved, task_rejected
- Audit
  - DB stores supervisor and superadmin approval timestamps and user IDs.

## Phase 5 — UX, Accessibility, Theming
- Web Responsive Grid

```html
<div className="grid grid-cols-12 gap-4">
  <div className="col-span-12 md:col-span-6"></div>
</div>
```

- Shadcn UI Components
  - Tabs, Button, Card, Badge, Dialog, AlertDialog
- Tailwind Responsive Examples

```tsx
<div className="flex flex-col md:flex-row gap-4">
  <div className="w-full md:w-1/2"></div>
  <div className="w-full md:w-1/2"></div>
</div>
```

- Accessibility
  - Labels on action buttons, role-gated visibility, WCAG color contrast, focus management.
- Theming
  - Light and dark palettes for mobile and web; primary/foreground usage consistent.

## Phase 6 — QA and Rollout
- Test Cases
  - Technician submission enable/disable logic
  - Supervisor approve/reject transitions
  - Superadmin approve/reject transitions
  - Push notifications deliver on approval transitions
- Validation
  - Lint and typecheck
  - E2E flows across roles
- Rollout
  - Staging validation, then production release

## Backend Schema Notes
- Tables
  - pm.PMTasks: ApprovalStatus enum, trail timestamps and foreign keys to pm.Users.
- Migrations
  - Schema SQL kept in db/schema.sql and applied via runner.

