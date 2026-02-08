import express from "express";
import cors, { type CorsOptions } from "cors";
import swaggerUi from "swagger-ui-express";
import { env } from "./config/env.js";
import { authRouter } from "./routes/auth.js";
import { assetsRouter } from "./routes/assets.js";
import { facilitiesRouter } from "./routes/facilities.js";
import { templatesRouter } from "./routes/templates.js";
import { schedulingRouter } from "./routes/scheduling.js";
import { tasksRouter } from "./routes/tasks.js";
import { reportsRouter } from "./routes/reports.js";
import { notificationsRouter } from "./routes/notifications.js";
import { systemRouter } from "./routes/system.js";
import { dashboardRouter } from "./routes/dashboard.js";
import { workOrdersRouter } from "./routes/workOrders.js";
import { devicesRouter } from "./routes/devices.js";
import { startJobs } from "./jobs/index.js";

const app = express();

type OpenApiSchema = {
  openapi: string;
  info: { title: string; version: string; description?: string };
  servers: Array<{ url: string }>;
  components?: {
    securitySchemes?: Record<string, unknown>;
    schemas?: Record<string, unknown>;
  };
  security?: Array<Record<string, string[]>>;
  tags?: Array<{ name: string; description?: string }>;
  paths: Record<string, unknown>;
};

const openApiSpec: OpenApiSchema = {
  openapi: "3.1.0",
  info: {
    title: "Preventive Pilot API",
    version: "1.0.1",
    description: "REST API for Preventive Pilot (web + mobile clients). Docs updated 2026-01-07.",
  },
  servers: [{ url: "http://localhost:" + String(env.BACKEND_PORT) }],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
      },
    },
    schemas: {
      EntityRef: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: ["string", "null"] },
        },
        required: ["id"],
        additionalProperties: false,
      },
      EntityRefNullable: {
        type: "object",
        properties: {
          id: { type: ["string", "null"] },
          name: { type: ["string", "null"] },
        },
        required: ["id", "name"],
        additionalProperties: false,
      },
      AssetPmInfo: {
        type: "object",
        properties: {
          enabled: { type: ["boolean", "null"] },
          defaultTemplateId: { type: ["string", "null"], format: "uuid" },
          lastCompletedAt: { type: ["string", "null"], format: "date-time" },
          nextDueAt: { type: ["string", "null"], format: "date-time" },
        },
        required: ["enabled"],
        additionalProperties: false,
      },
      AssetListItem: {
        type: "object",
        properties: {
          id: { type: "string" },
          snipeAssetId: { type: ["string", "null"] },
          assetTag: { type: ["string", "null"] },
          name: { type: "string" },
          manufacturer: { type: ["string", "null"] },
          model: { type: ["string", "null"] },
          serialNumber: { type: ["string", "null"] },
          assetStatus: { type: ["string", "null"] },
          assetOperationalStatus: { type: "string", enum: ["operational", "broken", "archived"] },
          assignedToText: { type: ["string", "null"] },
          imageUrl: { type: ["string", "null"], format: "uri" },
          category: { $ref: "#/components/schemas/EntityRefNullable" },
          location: { $ref: "#/components/schemas/EntityRefNullable" },
          pm: { $ref: "#/components/schemas/AssetPmInfo" },
        },
        required: ["id", "name", "assetOperationalStatus", "category", "location", "pm"],
        additionalProperties: false,
      },
      AssetListResponse: {
        type: "object",
        properties: {
          page: { type: "integer" },
          pageSize: { type: "integer" },
          items: { type: "array", items: { $ref: "#/components/schemas/AssetListItem" } },
        },
        required: ["page", "pageSize", "items"],
        additionalProperties: false,
      },
      FacilityPmInfo: {
        type: "object",
        properties: {
          enabled: { type: ["boolean", "null"] },
          defaultTemplateId: { type: ["string", "null"], format: "uuid" },
          lastCompletedAt: { type: ["string", "null"], format: "date-time" },
          nextDueAt: { type: ["string", "null"], format: "date-time" },
        },
        required: ["enabled"],
        additionalProperties: false,
      },
      FacilityListItem: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          description: { type: ["string", "null"] },
          isActive: { type: "boolean" },
          location: { $ref: "#/components/schemas/EntityRefNullable" },
          pm: { $ref: "#/components/schemas/FacilityPmInfo" },
        },
        required: ["id", "name", "isActive", "location", "pm"],
        additionalProperties: false,
      },
      FacilityListResponse: {
        type: "object",
        properties: {
          page: { type: "integer" },
          pageSize: { type: "integer" },
          items: { type: "array", items: { $ref: "#/components/schemas/FacilityListItem" } },
        },
        required: ["page", "pageSize", "items"],
        additionalProperties: false,
      },
      AssetDetail: {
        type: "object",
        properties: {
          id: { type: "string" },
          snipeAssetId: { type: ["string", "null"] },
          assetTag: { type: ["string", "null"] },
          name: { type: "string" },
          manufacturer: { type: ["string", "null"] },
          model: { type: ["string", "null"] },
          serialNumber: { type: ["string", "null"] },
          assetStatus: { type: ["string", "null"] },
          assetOperationalStatus: { type: "string", enum: ["operational", "broken", "archived"] },
          assignedToText: { type: ["string", "null"] },
          snipeNotes: { type: ["string", "null"] },
          imageUrl: { type: ["string", "null"], format: "uri" },
          category: { oneOf: [{ $ref: "#/components/schemas/EntityRef" }, { type: "null" }] },
          location: { oneOf: [{ $ref: "#/components/schemas/EntityRef" }, { type: "null" }] },
          pm: { $ref: "#/components/schemas/AssetPmInfo" },
        },
        required: ["id", "name", "assetOperationalStatus", "pm"],
        additionalProperties: false,
      },
      Role: {
        type: "object",
        properties: {
          id: { type: "string", description: "Role UUID" },
          name: { type: "string" },
        },
        required: ["id", "name"],
        additionalProperties: false,
      },
      AssetCategory: {
        type: "object",
        properties: {
          id: { type: "string", description: "Category UUID" },
          name: { type: "string" },
          isActive: { type: "boolean" },
        },
        required: ["id", "name", "isActive"],
        additionalProperties: false,
      },
      Location: {
        type: "object",
        properties: {
          id: { type: "string", description: "Location UUID" },
          name: { type: "string" },
          isActive: { type: "boolean" },
        },
        required: ["id", "name", "isActive"],
        additionalProperties: false,
      },
      LookupsResponse: {
        type: "object",
        properties: {
          roles: { type: "array", items: { $ref: "#/components/schemas/Role" } },
          assetCategories: { type: "array", items: { $ref: "#/components/schemas/AssetCategory" } },
          locations: { type: "array", items: { $ref: "#/components/schemas/Location" } },
        },
        required: ["roles", "assetCategories", "locations"],
        additionalProperties: false,
      },
      UserSummary: {
        type: "object",
        properties: {
          id: { type: "string" },
          username: { type: "string" },
          displayName: { type: ["string", "null"] },
          email: { type: ["string", "null"] },
          phone: { type: ["string", "null"] },
          externalProvider: { type: ["string", "null"] },
          isActive: { type: "boolean" },
          roles: { type: "array", items: { type: "string" } },
          tasksCompleted: { type: "integer" },
        },
        required: ["id", "username", "isActive", "roles", "tasksCompleted", "externalProvider"],
        additionalProperties: false,
      },
      UsersListResponse: {
        type: "object",
        properties: {
          page: { type: "integer" },
          pageSize: { type: "integer" },
          total: { type: "integer" },
          items: { type: "array", items: { $ref: "#/components/schemas/UserSummary" } },
        },
        required: ["page", "pageSize", "total", "items"],
        additionalProperties: false,
      },
      UpdateUserRolesRequest: {
        type: "object",
        properties: {
          roles: { type: "array", items: { type: "string" } },
          isActive: { type: "boolean" },
        },
        required: ["roles"],
        additionalProperties: false,
      },
      UpdateUserRolesResponse: {
        type: "object",
        properties: {
          ok: { type: "boolean" },
          roles: { type: "array", items: { type: "string" } },
        },
        required: ["ok", "roles"],
        additionalProperties: false,
      },
      OkResponse: {
        type: "object",
        properties: {
          ok: { type: "boolean" },
        },
        required: ["ok"],
        additionalProperties: false,
      },
      IdResponse: {
        type: "object",
        properties: {
          id: { type: "string" },
        },
        required: ["id"],
        additionalProperties: false,
      },
      ErrorResponse: {
        type: "object",
        properties: {
          message: { type: "string" },
        },
        required: ["message"],
        additionalProperties: true,
      },
      LoginRequest: {
        type: "object",
        properties: {
          identifier: { type: "string" },
          username: { type: "string" },
          password: { type: "string" },
          provider: { type: "string", enum: ["ldap", "local"], default: "ldap" },
        },
        required: ["password"],
        additionalProperties: false,
      },
      LoginResponse: {
        type: "object",
        properties: {
          accessToken: { type: "string" },
          refreshToken: { type: "string" },
          user: {
            type: "object",
            properties: {
              id: { type: "string" },
              username: { type: "string" },
              displayName: { type: ["string", "null"] },
              email: { type: ["string", "null"] },
              roles: { type: "array", items: { type: "string" } },
            },
            required: ["id", "username", "roles"],
          },
        },
        required: ["accessToken", "refreshToken", "user"],
      },
      RefreshRequest: {
        type: "object",
        properties: { refreshToken: { type: "string" } },
        required: ["refreshToken"],
        additionalProperties: false,
      },
      RefreshResponse: {
        type: "object",
        properties: { accessToken: { type: "string" }, refreshToken: { type: "string" } },
        required: ["accessToken", "refreshToken"],
        additionalProperties: false,
      },
      MeResponse: {
        type: "object",
        properties: {
          user: {
            type: "object",
            properties: {
              id: { type: "string" },
              username: { type: "string" },
              roles: { type: "array", items: { type: "string" } },
            },
            required: ["id", "username", "roles"],
          },
        },
        required: ["user"],
      },
      PaginatedList: {
        type: "object",
        properties: {
          page: { type: "integer" },
          pageSize: { type: "integer" },
          items: { type: "array" },
        },
        required: ["page", "pageSize", "items"],
      },
      PmNowRequest: {
        type: "object",
        properties: {
          assetId: { type: "string", format: "uuid" },
        },
        required: ["assetId"],
        additionalProperties: false,
      },
      BulkSetPmEnabledRequest: {
        type: "object",
        properties: {
          assetIds: { type: "array", items: { type: "string", format: "uuid" }, minItems: 1, maxItems: 500 },
          pmEnabled: { type: "boolean" },
        },
        required: ["assetIds", "pmEnabled"],
        additionalProperties: false,
      },
      BulkSetPmTemplateRequest: {
        type: "object",
        properties: {
          assetIds: { type: "array", items: { type: "string", format: "uuid" }, minItems: 1, maxItems: 500 },
          defaultTemplateId: { type: ["string", "null"], format: "uuid" },
        },
        required: ["assetIds", "defaultTemplateId"],
        additionalProperties: false,
      },
      UpdateAssetPmRequest: {
        type: "object",
        properties: {
          pmEnabled: { type: "boolean" },
          defaultTemplateId: { type: ["string", "null"], format: "uuid" },
          nextPmDueAt: { type: ["string", "null"], format: "date-time" },
        },
        additionalProperties: false,
      },
      NotificationChannelCreateRequest: {
        type: "object",
        properties: {
          channelType: { type: "string", maxLength: 32 },
          config: { type: ["string", "null"] },
          isActive: { type: "boolean", default: true },
        },
        required: ["channelType"],
        additionalProperties: false,
      },
      NotificationChannelUpdateRequest: {
        type: "object",
        properties: {
          channelType: { type: "string", maxLength: 32 },
          config: { type: ["string", "null"] },
          isActive: { type: "boolean" },
        },
        additionalProperties: false,
      },
      NotificationRuleCreateRequest: {
        type: "object",
        properties: {
          ruleName: { type: "string", maxLength: 256 },
          eventType: { type: "string", maxLength: 64 },
          offsetDays: { type: ["integer", "null"] },
          escalateAfterDays: { type: ["integer", "null"] },
          channelId: { type: "string", format: "uuid" },
          messageTemplate: { type: ["string", "null"] },
          isActive: { type: "boolean", default: true },
        },
        required: ["ruleName", "eventType", "channelId"],
        additionalProperties: false,
      },
      NotificationRuleUpdateRequest: {
        type: "object",
        properties: {
          ruleName: { type: "string", maxLength: 256 },
          eventType: { type: "string", maxLength: 64 },
          offsetDays: { type: ["integer", "null"] },
          escalateAfterDays: { type: ["integer", "null"] },
          channelId: { type: "string", format: "uuid" },
          messageTemplate: { type: ["string", "null"] },
          isActive: { type: "boolean" },
        },
        additionalProperties: false,
      },
      TaskAssignRequest: {
        type: "object",
        properties: {
          assigneeUserId: { type: ["string", "null"], format: "uuid" },
        },
        required: ["assigneeUserId"],
        additionalProperties: false,
      },
      WorkOrderCreateRequest: {
        type: "object",
        properties: {
          assetId: { type: ["string", "null"], format: "uuid" },
          facilityId: { type: ["string", "null"], format: "uuid" },
          templateId: { type: ["string", "null"], format: "uuid" },
          symptom: { type: "string", maxLength: 1024 },
          impactLevel: { type: ["string", "null"], enum: ["normal", "high", "critical"] },
          failureCategory: { type: ["string", "null"], maxLength: 64 },
          failureCode: { type: ["string", "null"], maxLength: 64 },
          downtimeStartedAt: { type: ["string", "null"], format: "date-time" },
          reportedChannel: { type: ["string", "null"], maxLength: 32 },
        },
        required: ["symptom"],
        additionalProperties: false,
      },
      WorkOrderAssignRequest: {
        type: "object",
        properties: {
          assignedToUserId: { type: ["string", "null"], format: "uuid" },
          assignedToRoleId: { type: ["string", "null"], format: "uuid" },
          priority: { type: ["string", "null"], enum: ["low", "medium", "high"] },
        },
        additionalProperties: false,
      },
      WorkOrderChecklistResult: {
        type: "object",
        properties: {
          templateChecklistItemId: { type: "string", format: "uuid" },
          outcome: { type: "integer", enum: [0, 1, 2] },
          notes: { type: ["string", "null"], maxLength: 1024 },
        },
        required: ["templateChecklistItemId", "outcome"],
        additionalProperties: false,
      },
      WorkOrderCompleteRequest: {
        type: "object",
        properties: {
          checklistResults: { type: "array", items: { $ref: "#/components/schemas/WorkOrderChecklistResult" } },
          forceCompleted: { type: ["boolean", "null"] },
          completedAt: { type: ["string", "null"], format: "date-time" },
          backdateReason: { type: ["string", "null"], maxLength: 1024 },
          technicianName: { type: ["string", "null"], maxLength: 256 },
        },
        additionalProperties: false,
      },
      SchedulingAssignmentRule: {
        type: "object",
        properties: {
          RuleId: { type: "string", format: "uuid" },
          Priority: { type: "integer" },
          CategoryId: { type: ["string", "null"], format: "uuid" },
          LocationId: { type: ["string", "null"], format: "uuid" },
          AssetStatus: { type: ["string", "null"] },
          AssignToUserId: { type: ["string", "null"], format: "uuid" },
          AssignToRoleId: { type: ["string", "null"], format: "uuid" },
          IsActive: { type: "boolean" },
          EffectiveFrom: { type: ["string", "null"], format: "date-time" },
          EffectiveTo: { type: ["string", "null"], format: "date-time" },
          CreatedAt: { type: "string", format: "date-time" },
          UpdatedAt: { type: "string", format: "date-time" },
        },
        required: ["RuleId", "Priority", "IsActive", "CreatedAt", "UpdatedAt"],
        additionalProperties: false,
      },
      SchedulingAssignmentRuleListResponse: {
        type: "object",
        properties: {
          items: { type: "array", items: { $ref: "#/components/schemas/SchedulingAssignmentRule" } },
        },
        required: ["items"],
        additionalProperties: false,
      },
      SchedulingAssignmentRuleCreateRequest: {
        type: "object",
        properties: {
          priority: { type: "integer" },
          categoryId: { type: ["string", "null"], format: "uuid" },
          locationId: { type: ["string", "null"], format: "uuid" },
          assetStatus: { type: ["string", "null"] },
          assignToUserId: { type: ["string", "null"], format: "uuid" },
          assignToRoleId: { type: ["string", "null"], format: "uuid" },
          isActive: { type: ["boolean", "null"] },
          effectiveFrom: { type: ["string", "null"], format: "date-time" },
          effectiveTo: { type: ["string", "null"], format: "date-time" },
        },
        required: ["priority"],
        additionalProperties: false,
      },
      SchedulingAssignmentRuleUpdateRequest: {
        type: "object",
        properties: {
          priority: { type: "integer" },
          categoryId: { type: ["string", "null"], format: "uuid" },
          locationId: { type: ["string", "null"], format: "uuid" },
          assetStatus: { type: ["string", "null"] },
          assignToUserId: { type: ["string", "null"], format: "uuid" },
          assignToRoleId: { type: ["string", "null"], format: "uuid" },
          isActive: { type: ["boolean", "null"] },
          effectiveFrom: { type: ["string", "null"], format: "date-time" },
          effectiveTo: { type: ["string", "null"], format: "date-time" },
        },
        additionalProperties: false,
      },
      SchedulingBlackoutWindow: {
        type: "object",
        properties: {
          BlackoutWindowId: { type: "string", format: "uuid" },
          Name: { type: "string" },
          StartsAt: { type: "string", format: "date-time" },
          EndsAt: { type: "string", format: "date-time" },
          IsActive: { type: "boolean" },
          CreatedAt: { type: "string", format: "date-time" },
          UpdatedAt: { type: "string", format: "date-time" },
        },
        required: ["BlackoutWindowId", "Name", "StartsAt", "EndsAt", "IsActive", "CreatedAt", "UpdatedAt"],
        additionalProperties: false,
      },
      SchedulingBlackoutWindowListResponse: {
        type: "object",
        properties: {
          items: { type: "array", items: { $ref: "#/components/schemas/SchedulingBlackoutWindow" } },
        },
        required: ["items"],
        additionalProperties: false,
      },
      SchedulingBlackoutWindowCreateRequest: {
        type: "object",
        properties: {
          name: { type: "string" },
          startsAt: { type: "string", format: "date-time" },
          endsAt: { type: "string", format: "date-time" },
          isActive: { type: ["boolean", "null"] },
        },
        required: ["name", "startsAt", "endsAt"],
        additionalProperties: false,
      },
      SchedulingBlackoutWindowUpdateRequest: {
        type: "object",
        properties: {
          name: { type: "string" },
          startsAt: { type: "string", format: "date-time" },
          endsAt: { type: "string", format: "date-time" },
          isActive: { type: ["boolean", "null"] },
        },
        additionalProperties: false,
      },
      SchedulingCalendarDay: {
        type: "object",
        properties: {
          date: { type: "string", format: "date" },
          type: { type: "string", enum: ["scheduled", "due", "overdue"] },
          count: { type: "integer" },
          capacityMinutes: { type: "integer" },
        },
        required: ["date", "type", "count", "capacityMinutes"],
        additionalProperties: false,
      },
      SchedulingCalendarResponse: {
        type: "object",
        properties: {
          items: { type: "array", items: { $ref: "#/components/schemas/SchedulingCalendarDay" } },
        },
        required: ["items"],
        additionalProperties: false,
      },
      SchedulingDayEventItem: {
        type: "object",
        properties: {
          id: { type: "string" },
          taskNumber: { type: "string" },
          scheduledDueAt: { type: "string", format: "date-time" },
          status: { type: "string" },
          priority: { type: "string" },
          estimatedMinutes: { type: "integer" },
          bucket: { type: "string", enum: ["scheduled", "due", "overdue"] },
          asset: {
            type: "object",
            properties: {
              id: { type: "string" },
              assetTag: { type: "string" },
              name: { type: "string" },
            },
            required: ["id", "assetTag", "name"],
            additionalProperties: false,
          },
          template: {
            type: "object",
            properties: {
              id: { type: "string" },
              name: { type: "string" },
            },
            required: ["id", "name"],
            additionalProperties: false,
          },
        },
        required: [
          "id",
          "taskNumber",
          "scheduledDueAt",
          "status",
          "priority",
          "estimatedMinutes",
          "bucket",
          "asset",
          "template",
        ],
        additionalProperties: false,
      },
      SchedulingDayEventsResponse: {
        type: "object",
        properties: {
          items: { type: "array", items: { $ref: "#/components/schemas/SchedulingDayEventItem" } },
        },
        required: ["items"],
        additionalProperties: false,
      },
      SchedulingRecalculateRequest: {
        type: "object",
        properties: {
          assetId: { type: ["string", "null"], format: "uuid" },
          facilityId: { type: ["string", "null"], format: "uuid" },
          force: { type: ["boolean", "null"] },
        },
        additionalProperties: false,
      },
      SchedulingRecalculateResponse: {
        type: "object",
        properties: {
          updated: { type: "integer" },
        },
        required: ["updated"],
        additionalProperties: false,
      },
      WorkOrderListItem: {
        type: "object",
        properties: {
          id: { type: "string" },
          taskNumber: { type: "string" },
          status: { type: "string" },
          priority: { type: ["string", "null"], enum: ["low", "medium", "high"] },
          scheduledDueAt: { type: ["string", "null"], format: "date-time" },
          createdAt: { type: "string", format: "date-time" },
          startedAt: { type: ["string", "null"], format: "date-time" },
          completedAt: { type: ["string", "null"], format: "date-time" },
          symptom: { type: ["string", "null"] },
          impactLevel: { type: ["string", "null"] },
          failureCategory: { type: ["string", "null"] },
          failureCode: { type: ["string", "null"] },
          reportedAt: { type: ["string", "null"], format: "date-time" },
          reportedByUsername: { type: ["string", "null"] },
          asset: { $ref: "#/components/schemas/EntityRefNullable" },
          facility: { $ref: "#/components/schemas/EntityRefNullable" },
          templateName: { type: ["string", "null"] },
          assignedTo: {
            type: "object",
            properties: {
              userId: { type: ["string", "null"], format: "uuid" },
              username: { type: ["string", "null"] },
              displayName: { type: ["string", "null"] },
              roleId: { type: ["string", "null"], format: "uuid" },
              roleName: { type: ["string", "null"] },
            },
            required: ["userId", "username", "displayName", "roleId", "roleName"],
            additionalProperties: false,
          },
        },
        required: [
          "id",
          "taskNumber",
          "status",
          "createdAt",
          "asset",
          "facility",
          "assignedTo",
        ],
        additionalProperties: false,
      },
      WorkOrderListResponse: {
        type: "object",
        properties: {
          page: { type: "integer" },
          pageSize: { type: "integer" },
          items: { type: "array", items: { $ref: "#/components/schemas/WorkOrderListItem" } },
        },
        required: ["page", "pageSize", "items"],
        additionalProperties: false,
      },
      WorkOrderDetail: {
        type: "object",
        properties: {
          id: { type: "string" },
          taskNumber: { type: "string" },
          status: { type: "string" },
          priority: { type: ["string", "null"], enum: ["low", "medium", "high"] },
          scheduledDueAt: { type: ["string", "null"], format: "date-time" },
          createdAt: { type: "string", format: "date-time" },
          startedAt: { type: ["string", "null"], format: "date-time" },
          completedAt: { type: ["string", "null"], format: "date-time" },
          cancelledAt: { type: ["string", "null"], format: "date-time" },
          symptom: { type: ["string", "null"] },
          impactLevel: { type: ["string", "null"] },
          failureCategory: { type: ["string", "null"] },
          failureCode: { type: ["string", "null"] },
          reportedAt: { type: ["string", "null"], format: "date-time" },
          asset: { $ref: "#/components/schemas/EntityRefNullable" },
          facility: { $ref: "#/components/schemas/EntityRefNullable" },
          template: { $ref: "#/components/schemas/EntityRef" },
          assignedTo: {
            type: "object",
            properties: {
              userId: { type: ["string", "null"], format: "uuid" },
              username: { type: ["string", "null"] },
              displayName: { type: ["string", "null"] },
              roleId: { type: ["string", "null"], format: "uuid" },
              roleName: { type: ["string", "null"] },
            },
            required: ["userId", "username", "displayName", "roleId", "roleName"],
            additionalProperties: false,
          },
          completedBy: {
            oneOf: [
              {
                type: "object",
                properties: {
                  userId: { type: "string", format: "uuid" },
                  username: { type: ["string", "null"] },
                  displayName: { type: ["string", "null"] },
                },
                required: ["userId"],
              },
              { type: "null" },
            ],
          },
          cancelledBy: {
            oneOf: [
              {
                type: "object",
                properties: {
                  userId: { type: "string", format: "uuid" },
                  username: { type: ["string", "null"] },
                  displayName: { type: ["string", "null"] },
                },
                required: ["userId"],
              },
              { type: "null" },
            ],
          },
        },
        required: ["id", "taskNumber", "status", "createdAt", "asset", "facility", "template", "assignedTo"],
        additionalProperties: false,
      },
    },
  },
  security: [{ bearerAuth: [] }],
  tags: [
    { name: "Health" },
    { name: "Auth" },
    { name: "Assets" },
    { name: "Facilities" },
    { name: "Scheduling" },
    { name: "Tasks" },
    { name: "Work Orders" },
    { name: "Notifications" },
    { name: "System" },
  ],
  paths: {
    "/health": {
      get: {
        tags: ["Health"],
        summary: "Health check",
        security: [],
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { status: { type: "string" } },
                  required: ["status"],
                },
              },
            },
          },
        },
      },
    },
    "/api/auth/login": {
      post: {
        tags: ["Auth"],
        summary: "Login and receive access token",
        security: [],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/LoginRequest" },
            },
          },
        },
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LoginResponse" },
              },
            },
          },
          "400": {
            description: "Invalid request",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
          "401": {
            description: "Invalid username or password",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
        },
      },
    },
    "/api/auth/refresh": {
      post: {
        tags: ["Auth"],
        summary: "Refresh access token",
        security: [],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/RefreshRequest" } } },
        },
        responses: {
          "200": {
            description: "OK",
            content: { "application/json": { schema: { $ref: "#/components/schemas/RefreshResponse" } } },
          },
          "400": {
            description: "Invalid request",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
          "401": {
            description: "Unauthorized",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
        },
      },
    },
    "/api/auth/me": {
      get: {
        tags: ["Auth"],
        summary: "Get current user",
        responses: {
          "200": {
            description: "OK",
            content: { "application/json": { schema: { $ref: "#/components/schemas/MeResponse" } } },
          },
          "401": {
            description: "Unauthorized",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
        },
      },
    },
    "/api/assets": {
      get: {
        tags: ["Assets"],
        summary: "List assets (updated)",
        description:
          "Returns a paginated list of assets. Search matches substrings in Name, AssetTag, and SerialNumber. Use categoryId or categoryIds (CSV of UUIDs, max 50) to filter. pageSize is capped at 500.",
        parameters: [
          {
            name: "search",
            in: "query",
            required: false,
            description: "Substring match on Name, AssetTag, SerialNumber",
            schema: { type: "string" },
          },
          { name: "categoryId", in: "query", required: false, schema: { type: "string", format: "uuid" } },
          {
            name: "categoryIds",
            in: "query",
            required: false,
            description: "Comma-separated list of category UUIDs (max 50)",
            schema: { type: "string" },
            examples: {
              csv: { summary: "CSV UUIDs", value: "e1f2...,c3d4...,a5b6..." },
            },
          },
          { name: "locationId", in: "query", required: false, schema: { type: "string", format: "uuid" } },
          { name: "status", in: "query", required: false, description: "Exact match on asset status", schema: { type: "string" } },
          {
            name: "operationalStatus",
            in: "query",
            required: false,
            description: "Filter by normalized operational status",
            schema: { type: "string", enum: ["operational", "broken", "archived"] },
          },
          {
            name: "pmEnabled",
            in: "query",
            required: false,
            description: "Filter by PM enabled",
            schema: { oneOf: [{ type: "string", enum: ["true", "false"] }, { type: "boolean" }] },
          },
          { name: "page", in: "query", required: false, schema: { type: "integer", default: 1, minimum: 1 } },
          { name: "pageSize", in: "query", required: false, schema: { type: "integer", default: 50, minimum: 1, maximum: 500 } },
        ],
        responses: {
          "200": {
            description: "OK",
            content: { "application/json": { schema: { $ref: "#/components/schemas/AssetListResponse" } } },
          },
          "400": {
            description: "Invalid request",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
          "401": {
            description: "Unauthorized",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
        },
      },
    },
    "/api/facilities": {
      get: {
        tags: ["Facilities"],
        summary: "List facilities",
        description:
          "Returns a paginated list of facilities that can have PM configured. Facilities represent locations or areas, not Snipe-IT assets.",
        parameters: [
          {
            name: "search",
            in: "query",
            required: false,
            description: "Substring match on Name or Description",
            schema: { type: "string" },
          },
          { name: "locationId", in: "query", required: false, schema: { type: "string", format: "uuid" } },
          {
            name: "pmEnabled",
            in: "query",
            required: false,
            description: "Filter by PM enabled",
            schema: { oneOf: [{ type: "string", enum: ["true", "false"] }, { type: "boolean" }] },
          },
          { name: "page", in: "query", required: false, schema: { type: "integer", default: 1, minimum: 1 } },
          { name: "pageSize", in: "query", required: false, schema: { type: "integer", default: 50, minimum: 1, maximum: 500 } },
        ],
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/FacilityListResponse" },
              },
            },
          },
          "400": {
            description: "Invalid request",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
          "401": {
            description: "Unauthorized",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
        },
      },
      post: {
        tags: ["Facilities"],
        summary: "Create facility",
        description: "Create a new facility record for non-asset PM.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  locationId: { type: ["string", "null"], format: "uuid" },
                  description: { type: ["string", "null"] },
                  isActive: { type: "boolean" },
                },
                required: ["name"],
                additionalProperties: false,
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Created",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/IdResponse" } },
            },
          },
          "400": {
            description: "Invalid request",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
          "401": {
            description: "Unauthorized",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
          "403": {
            description: "Forbidden",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
        },
      },
    },
    "/api/assets/{assetId}": {
      get: {
        tags: ["Assets"],
        summary: "Get asset by id (updated)",
        parameters: [
          { name: "assetId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        responses: {
          "200": { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/AssetDetail" } } } },
          "400": {
            description: "Invalid request",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
          "401": {
            description: "Unauthorized",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
          "404": {
            description: "Not found",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
        },
      },
    },
    "/api/assets/{assetId}/image": {
      get: {
        tags: ["Assets"],
        summary: "Get asset image as binary",
        parameters: [{ name: "assetId", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/octet-stream": {
                schema: { type: "string", format: "binary" },
              },
            },
          },
          "400": {
            description: "Invalid request",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
          "401": {
            description: "Unauthorized",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
          "404": {
            description: "Not found",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
        },
      },
    },
    "/api/assets/{assetId}/pm": {
      patch: {
        tags: ["Assets"],
        summary: "Update asset PM settings",
        parameters: [
          { name: "assetId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/UpdateAssetPmRequest" } },
          },
        },
        responses: {
          "200": {
            description: "OK",
            content: { "application/json": { schema: { $ref: "#/components/schemas/OkResponse" } } },
          },
          "400": {
            description: "Invalid request",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
          "401": {
            description: "Unauthorized",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
          "403": {
            description: "Forbidden",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
          "404": {
            description: "Not found",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
        },
      },
    },
    "/api/assets/pm/bulk": {
      post: {
        tags: ["Assets"],
        summary: "Bulk set PM enabled",
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/BulkSetPmEnabledRequest" } },
          },
        },
        responses: {
          "200": {
            description: "OK",
            content: { "application/json": { schema: { $ref: "#/components/schemas/OkResponse" } } },
          },
          "400": {
            description: "Invalid request",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
          "401": {
            description: "Unauthorized",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
          "403": {
            description: "Forbidden",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
        },
      },
    },
    "/api/assets/pm/bulk/template": {
      post: {
        tags: ["Assets"],
        summary: "Bulk set default PM template",
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/BulkSetPmTemplateRequest" } },
          },
        },
        responses: {
          "200": {
            description: "OK",
            content: { "application/json": { schema: { $ref: "#/components/schemas/OkResponse" } } },
          },
          "400": {
            description: "Invalid request",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
          "401": {
            description: "Unauthorized",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
          "403": {
            description: "Forbidden",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
        },
      },
    },
    "/api/tasks": {
      get: {
        tags: ["Tasks"],
        summary: "List tasks",
        parameters: [
          { name: "status", in: "query", required: false, schema: { type: "string" } },
          { name: "assigned", in: "query", required: false, schema: { type: "string", enum: ["me", "unassigned", "any"], default: "any" } },
          { name: "overdue", in: "query", required: false, schema: { type: "string", enum: ["true", "false"] } },
          { name: "maintenanceType", in: "query", required: false, schema: { type: "string", enum: ["PM", "CM", "all"] } },
          { name: "assetId", in: "query", required: false, schema: { type: "string", format: "uuid" } },
          { name: "templateId", in: "query", required: false, schema: { type: "string", format: "uuid" } },
          {
            name: "dueFrom",
            in: "query",
            required: false,
            description: "Start of due range; accepts date-time or date (date assumes 00:00:00Z)",
            schema: { oneOf: [ { type: "string", format: "date-time" }, { type: "string", format: "date" } ] },
          },
          {
            name: "dueTo",
            in: "query",
            required: false,
            description: "End of due range; accepts date-time or date (date assumes 23:59:59Z)",
            schema: { oneOf: [ { type: "string", format: "date-time" }, { type: "string", format: "date" } ] },
          },
          { name: "page", in: "query", required: false, schema: { type: "integer", default: 1 } },
          { name: "pageSize", in: "query", required: false, schema: { type: "integer", default: 50 } },
        ],
        responses: {
          "200": {
            description: "OK",
            content: { "application/json": { schema: { $ref: "#/components/schemas/PaginatedList" } } },
          },
          "400": {
            description: "Invalid request",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
          "401": {
            description: "Unauthorized",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
        },
      },
    },
    "/api/tasks/pm-now": {
      post: {
        tags: ["Tasks"],
        summary: "Create an immediate PM task for an asset's default template",
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/PmNowRequest" } },
          },
        },
        responses: {
          "201": {
            description: "Created",
            content: { "application/json": { schema: { $ref: "#/components/schemas/IdResponse" } } },
          },
          "400": {
            description: "Invalid request",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
          "401": {
            description: "Unauthorized",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
          "403": {
            description: "Forbidden",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
          "404": {
            description: "Not found",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
          "500": {
            description: "Server error",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
        },
      },
    },
    "/api/tasks/evidence/{evidenceId}": {
      get: {
        tags: ["Tasks"],
        summary: "Download task evidence",
        parameters: [
          { name: "evidenceId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        responses: {
          "200": { description: "OK" },
          "400": {
            description: "Invalid request",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
          "401": {
            description: "Unauthorized",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
          "404": {
            description: "Not found",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
        },
      },
      delete: {
        tags: ["Tasks"],
        summary: "Delete task evidence",
        parameters: [
          { name: "evidenceId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        responses: {
          "200": {
            description: "OK",
            content: { "application/json": { schema: { $ref: "#/components/schemas/OkResponse" } } },
          },
          "400": {
            description: "Invalid request",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
          "401": {
            description: "Unauthorized",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
          "404": {
            description: "Not found",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
        },
      },
    },
    "/api/tasks/checklist-evidence/{checklistEvidenceId}": {
      get: {
        tags: ["Tasks"],
        summary: "Download checklist item evidence",
        parameters: [
          {
            name: "checklistEvidenceId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          "200": { description: "OK" },
          "400": {
            description: "Invalid request",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
          "401": {
            description: "Unauthorized",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
          "404": {
            description: "Not found",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
        },
      },
      delete: {
        tags: ["Tasks"],
        summary: "Delete checklist item evidence",
        parameters: [
          {
            name: "checklistEvidenceId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          "200": {
            description: "OK",
            content: { "application/json": { schema: { $ref: "#/components/schemas/OkResponse" } } },
          },
          "400": {
            description: "Invalid request",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
          "401": {
            description: "Unauthorized",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
          "404": {
            description: "Not found",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
        },
      },
    },
    "/api/tasks/{taskId}/export.pdf": {
      get: {
        tags: ["Tasks"],
        summary: "Export task PDF",
        parameters: [
          { name: "taskId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        responses: {
          "200": { description: "OK", content: { "application/pdf": { schema: { type: "string", format: "binary" } } } },
          "400": {
            description: "Invalid request",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
          "401": {
            description: "Unauthorized",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
          "404": {
            description: "Not found",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
        },
      },
    },
    "/api/tasks/{taskId}/assign": {
      post: {
        tags: ["Tasks"],
        summary: "Assign/unassign a task",
        parameters: [
          { name: "taskId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/TaskAssignRequest" } },
          },
        },
        responses: {
          "200": {
            description: "OK",
            content: { "application/json": { schema: { $ref: "#/components/schemas/OkResponse" } } },
          },
          "400": {
            description: "Invalid request",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
          "401": {
            description: "Unauthorized",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
          "403": {
            description: "Forbidden",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
          "404": {
            description: "Not found",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
        },
      },
    },
    "/api/tasks/{taskId}/start": {
      post: {
        tags: ["Tasks"],
        summary: "Start a task",
        parameters: [
          { name: "taskId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        responses: {
          "200": {
            description: "OK",
            content: { "application/json": { schema: { $ref: "#/components/schemas/OkResponse" } } },
          },
          "400": {
            description: "Invalid request",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
          "401": {
            description: "Unauthorized",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
          "404": {
            description: "Not found",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
        },
      },
    },
    "/api/tasks/{taskId}/pause": {
      post: {
        tags: ["Tasks"],
        summary: "Pause a task",
        parameters: [
          { name: "taskId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        responses: {
          "200": {
            description: "OK",
            content: { "application/json": { schema: { $ref: "#/components/schemas/OkResponse" } } },
          },
          "400": {
            description: "Invalid request",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
          "401": {
            description: "Unauthorized",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
          "404": {
            description: "Not found",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
        },
      },
    },
    "/api/tasks/{taskId}/resume": {
      post: {
        tags: ["Tasks"],
        summary: "Resume a task",
        parameters: [
          { name: "taskId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        responses: {
          "200": {
            description: "OK",
            content: { "application/json": { schema: { $ref: "#/components/schemas/OkResponse" } } },
          },
          "400": {
            description: "Invalid request",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
          "401": {
            description: "Unauthorized",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
          "404": {
            description: "Not found",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
        },
      },
    },
    "/api/tasks/{taskId}/cancel": {
      post: {
        tags: ["Tasks"],
        summary: "Cancel a task",
        parameters: [
          { name: "taskId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        responses: {
          "200": {
            description: "OK",
            content: { "application/json": { schema: { $ref: "#/components/schemas/OkResponse" } } },
          },
          "400": {
            description: "Invalid request",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
          "401": {
            description: "Unauthorized",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
          "404": {
            description: "Not found",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
        },
      },
    },
    "/api/tasks/{taskId}/complete": {
      post: {
        tags: ["Tasks"],
        summary: "Complete a task",
        parameters: [
          { name: "taskId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        responses: {
          "200": {
            description: "OK",
            content: { "application/json": { schema: { $ref: "#/components/schemas/OkResponse" } } },
          },
          "400": {
            description: "Invalid request",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
          "401": {
            description: "Unauthorized",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
          "404": {
            description: "Not found",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
        },
      },
    },
    "/api/tasks/{taskId}/submit-for-approval": {
      post: {
        tags: ["Tasks"],
        summary: "Submit task for approval",
        parameters: [
          { name: "taskId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        responses: {
          "200": {
            description: "OK",
            content: { "application/json": { schema: { $ref: "#/components/schemas/OkResponse" } } },
          },
          "400": {
            description: "Invalid request",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
          "401": {
            description: "Unauthorized",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
          "403": {
            description: "Forbidden",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
          "404": {
            description: "Not found",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
        },
      },
    },
    "/api/tasks/{taskId}/approve-by-supervisor": {
      post: {
        tags: ["Tasks"],
        summary: "Approve by supervisor",
        parameters: [
          { name: "taskId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        responses: {
          "200": {
            description: "OK",
            content: { "application/json": { schema: { $ref: "#/components/schemas/OkResponse" } } },
          },
          "400": {
            description: "Invalid request",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
          "401": {
            description: "Unauthorized",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
          "403": {
            description: "Forbidden",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
          "404": {
            description: "Not found",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
        },
      },
    },
    "/api/tasks/{taskId}/approve-by-superadmin": {
      post: {
        tags: ["Tasks"],
        summary: "Approve by superadmin",
        parameters: [
          { name: "taskId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        responses: {
          "200": {
            description: "OK",
            content: { "application/json": { schema: { $ref: "#/components/schemas/OkResponse" } } },
          },
          "400": {
            description: "Invalid request",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
          "401": {
            description: "Unauthorized",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
          "403": {
            description: "Forbidden",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
          "404": {
            description: "Not found",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
        },
      },
    },
    "/api/tasks/{taskId}/reject-approval": {
      post: {
        tags: ["Tasks"],
        summary: "Reject approval",
        parameters: [
          { name: "taskId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        requestBody: {
          required: false,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  reason: { type: "string" },
                  reopenTask: { type: "boolean" },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "OK",
            content: { "application/json": { schema: { $ref: "#/components/schemas/OkResponse" } } },
          },
          "400": {
            description: "Invalid request",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
          "401": {
            description: "Unauthorized",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
          "403": {
            description: "Forbidden",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
          "404": {
            description: "Not found",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
        },
      },
    },
    "/api/tasks/{taskId}/evidence": {
      post: {
        tags: ["Tasks"],
        summary: "Upload task evidence",
        parameters: [
          { name: "taskId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        requestBody: {
          required: true,
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                properties: {
                  file: { type: "string", format: "binary" },
                },
                required: ["file"],
              },
            },
          },
        },
        responses: {
          "200": { description: "OK" },
          "400": {
            description: "Invalid request",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
          "401": {
            description: "Unauthorized",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
          "404": {
            description: "Not found",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
        },
      },
    },
    "/api/notifications/channels": {
      get: {
        tags: ["Notifications"],
        summary: "List notification channels",
        responses: {
          "200": { description: "OK" },
          "401": {
            description: "Unauthorized",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
        },
      },
      post: {
        tags: ["Notifications"],
        summary: "Create notification channel",
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/NotificationChannelCreateRequest" } },
          },
        },
        responses: {
          "201": {
            description: "Created",
            content: { "application/json": { schema: { $ref: "#/components/schemas/IdResponse" } } },
          },
          "400": {
            description: "Invalid request",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
          "401": {
            description: "Unauthorized",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
          "403": {
            description: "Forbidden",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
        },
      },
    },
    "/api/notifications/channels/{channelId}": {
      put: {
        tags: ["Notifications"],
        summary: "Update notification channel",
        parameters: [
          { name: "channelId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/NotificationChannelUpdateRequest" } },
          },
        },
        responses: {
          "200": {
            description: "OK",
            content: { "application/json": { schema: { $ref: "#/components/schemas/OkResponse" } } },
          },
          "400": {
            description: "Invalid request",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
          "401": {
            description: "Unauthorized",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
          "403": {
            description: "Forbidden",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
          "404": {
            description: "Not found",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
        },
      },
    },
    "/api/notifications/rules": {
      get: {
        tags: ["Notifications"],
        summary: "List notification rules",
        responses: {
          "200": { description: "OK" },
          "401": {
            description: "Unauthorized",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
        },
      },
      post: {
        tags: ["Notifications"],
        summary: "Create notification rule",
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/NotificationRuleCreateRequest" } },
          },
        },
        responses: {
          "201": {
            description: "Created",
            content: { "application/json": { schema: { $ref: "#/components/schemas/IdResponse" } } },
          },
          "400": {
            description: "Invalid request",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
          "401": {
            description: "Unauthorized",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
          "403": {
            description: "Forbidden",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
        },
      },
    },
    "/api/notifications/rules/{ruleId}": {
      put: {
        tags: ["Notifications"],
        summary: "Update notification rule",
        parameters: [
          { name: "ruleId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/NotificationRuleUpdateRequest" } },
          },
        },
        responses: {
          "200": {
            description: "OK",
            content: { "application/json": { schema: { $ref: "#/components/schemas/OkResponse" } } },
          },
          "400": {
            description: "Invalid request",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
          "401": {
            description: "Unauthorized",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
          "403": {
            description: "Forbidden",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
          "404": {
            description: "Not found",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
        },
      },
    },
    "/api/notifications/log": {
      get: {
        tags: ["Notifications"],
        summary: "List notification log entries",
        parameters: [
          { name: "page", in: "query", required: false, schema: { type: "integer", default: 1 } },
          { name: "pageSize", in: "query", required: false, schema: { type: "integer", default: 50 } },
          { name: "taskId", in: "query", required: false, schema: { type: "string", format: "uuid" } },
          { name: "ruleId", in: "query", required: false, schema: { type: "string", format: "uuid" } },
          { name: "status", in: "query", required: false, schema: { type: "string" } },
        ],
        responses: {
          "200": { description: "OK" },
          "400": {
            description: "Invalid request",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
          "401": {
            description: "Unauthorized",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
          "403": {
            description: "Forbidden",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
        },
      },
    },
    "/api/system/lookups": {
      get: {
        tags: ["System"],
        summary: "List roles, categories, locations",
        responses: {
          "200": { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/LookupsResponse" } } } },
          "401": {
            description: "Unauthorized",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
        },
      },
    },
    "/api/system/users": {
      get: {
        tags: ["System"],
        summary: "List users",
        parameters: [
          { name: "page", in: "query", required: false, schema: { type: "integer", minimum: 1 } },
          { name: "pageSize", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: 200 } },
          { name: "search", in: "query", required: false, schema: { type: "string" } },
          { name: "isActive", in: "query", required: false, schema: { type: "string", enum: ["true", "false"] } },
        ],
        responses: {
          "200": { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/UsersListResponse" } } } },
          "400": { description: "Invalid request", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          "401": { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          "403": { description: "Forbidden", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
    },
    "/api/system/users/{userId}/roles": {
      put: {
        tags: ["System"],
        summary: "Update user roles",
        parameters: [
          { name: "userId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/UpdateUserRolesRequest" } } },
        },
        responses: {
          "200": { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/UpdateUserRolesResponse" } } } },
          "400": { description: "Invalid request", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          "401": { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          "403": { description: "Forbidden", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          "404": { description: "Not found", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
    },
    "/api/system/users/{userId}": {
      delete: {
        tags: ["System"],
        summary: "Delete local user",
        parameters: [
          { name: "userId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        responses: {
          "200": { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/OkResponse" } } } },
          "400": { description: "Invalid request", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          "401": { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          "403": { description: "Forbidden", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          "404": { description: "Not found", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
    },
    "/api/work-orders": {
      get: {
        tags: ["Work Orders"],
        summary: "List CM work orders",
        parameters: [
          { name: "page", in: "query", required: false, schema: { type: "integer", default: 1, minimum: 1 } },
          { name: "pageSize", in: "query", required: false, schema: { type: "integer", default: 50, minimum: 1, maximum: 200 } },
          { name: "status", in: "query", required: false, schema: { type: "string" } },
          { name: "assetId", in: "query", required: false, schema: { type: "string", format: "uuid" } },
          { name: "facilityId", in: "query", required: false, schema: { type: "string", format: "uuid" } },
          { name: "impactLevel", in: "query", required: false, schema: { type: "string" } },
          { name: "reportedFrom", in: "query", required: false, schema: { type: "string", format: "date-time" } },
          { name: "reportedTo", in: "query", required: false, schema: { type: "string", format: "date-time" } },
          { name: "completedFrom", in: "query", required: false, schema: { type: "string", format: "date-time" } },
          { name: "completedTo", in: "query", required: false, schema: { type: "string", format: "date-time" } },
          { name: "assigned", in: "query", required: false, schema: { type: "string", enum: ["any", "unassigned", "me"], default: "any" } },
        ],
        responses: {
          "200": { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/WorkOrderListResponse" } } } },
          "400": { description: "Invalid request", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          "401": { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
      post: {
        tags: ["Work Orders"],
        summary: "Create a CM work order",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/WorkOrderCreateRequest" } } },
        },
        responses: {
          "201": { description: "Created", content: { "application/json": { schema: { $ref: "#/components/schemas/IdResponse" } } } },
          "400": { description: "Invalid request", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          "401": { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          "403": { description: "Forbidden", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
    },
    "/api/work-orders/{taskId}": {
      get: {
        tags: ["Work Orders"],
        summary: "Get work order detail",
        parameters: [ { name: "taskId", in: "path", required: true, schema: { type: "string", format: "uuid" } } ],
        responses: {
          "200": { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/WorkOrderDetail" } } } },
          "400": { description: "Invalid request", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          "401": { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          "404": { description: "Not found", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
    },
    "/api/work-orders/{taskId}/assign": {
      post: {
        tags: ["Work Orders"],
        summary: "Assign/unassign work order",
        parameters: [ { name: "taskId", in: "path", required: true, schema: { type: "string", format: "uuid" } } ],
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/WorkOrderAssignRequest" } } } },
        responses: {
          "200": { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/OkResponse" } } } },
          "400": { description: "Invalid request", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          "401": { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          "403": { description: "Forbidden", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          "404": { description: "Not found", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
    },
    "/api/work-orders/{taskId}/start": {
      post: {
        tags: ["Work Orders"],
        summary: "Start work order",
        parameters: [ { name: "taskId", in: "path", required: true, schema: { type: "string", format: "uuid" } } ],
        responses: {
          "200": { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/OkResponse" } } } },
          "400": { description: "Invalid request", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          "401": { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          "404": { description: "Not found", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
    },
    "/api/work-orders/{taskId}/pause": {
      post: {
        tags: ["Work Orders"],
        summary: "Pause work order",
        parameters: [ { name: "taskId", in: "path", required: true, schema: { type: "string", format: "uuid" } } ],
        responses: {
          "200": { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/OkResponse" } } } },
          "400": { description: "Invalid request", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          "401": { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          "404": { description: "Not found", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
    },
    "/api/work-orders/{taskId}/resume": {
      post: {
        tags: ["Work Orders"],
        summary: "Resume work order",
        parameters: [ { name: "taskId", in: "path", required: true, schema: { type: "string", format: "uuid" } } ],
        responses: {
          "200": { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/OkResponse" } } } },
          "400": { description: "Invalid request", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          "401": { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          "404": { description: "Not found", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
    },
    "/api/work-orders/{taskId}/complete": {
      post: {
        tags: ["Work Orders"],
        summary: "Complete work order",
        parameters: [ { name: "taskId", in: "path", required: true, schema: { type: "string", format: "uuid" } } ],
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/WorkOrderCompleteRequest" } } } },
        responses: {
          "200": { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/OkResponse" } } } },
          "400": { description: "Invalid request", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          "401": { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          "403": { description: "Forbidden", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          "404": { description: "Not found", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
    },
    "/api/work-orders/{taskId}/cancel": {
      post: {
        tags: ["Work Orders"],
        summary: "Cancel work order",
        parameters: [ { name: "taskId", in: "path", required: true, schema: { type: "string", format: "uuid" } } ],
        responses: {
          "200": { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/OkResponse" } } } },
          "400": { description: "Invalid request", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          "401": { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          "404": { description: "Not found", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
    },
    "/api/work-orders/{taskId}/close-downtime": {
      post: {
        tags: ["Work Orders"],
        summary: "Close current downtime",
        parameters: [ { name: "taskId", in: "path", required: true, schema: { type: "string", format: "uuid" } } ],
        responses: {
          "200": { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/OkResponse" } } } },
          "400": { description: "Invalid request", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          "401": { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          "404": { description: "Not found", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
    },
    "/api/scheduling/assignment-rules": {
      get: {
        tags: ["Scheduling"],
        summary: "List scheduling assignment rules",
        responses: {
          "200": {
            description: "OK",
            content: { "application/json": { schema: { $ref: "#/components/schemas/SchedulingAssignmentRuleListResponse" } } },
          },
          "401": {
            description: "Unauthorized",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
        },
      },
      post: {
        tags: ["Scheduling"],
        summary: "Create scheduling assignment rule",
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/SchedulingAssignmentRuleCreateRequest" } },
          },
        },
        responses: {
          "201": {
            description: "Created",
            content: { "application/json": { schema: { $ref: "#/components/schemas/IdResponse" } } },
          },
          "400": {
            description: "Invalid request",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
          "401": {
            description: "Unauthorized",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
          "403": {
            description: "Forbidden",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
        },
      },
    },
    "/api/scheduling/assignment-rules/{ruleId}": {
      put: {
        tags: ["Scheduling"],
        summary: "Update scheduling assignment rule",
        parameters: [
          {
            name: "ruleId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/SchedulingAssignmentRuleUpdateRequest" } },
          },
        },
        responses: {
          "200": {
            description: "OK",
            content: { "application/json": { schema: { $ref: "#/components/schemas/OkResponse" } } },
          },
          "400": {
            description: "Invalid request",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
          "401": {
            description: "Unauthorized",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
          "403": {
            description: "Forbidden",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
          "404": {
            description: "Not found",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
        },
      },
      delete: {
        tags: ["Scheduling"],
        summary: "Deactivate scheduling assignment rule",
        parameters: [
          {
            name: "ruleId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          "200": {
            description: "OK",
            content: { "application/json": { schema: { $ref: "#/components/schemas/OkResponse" } } },
          },
          "400": {
            description: "Invalid request",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
          "401": {
            description: "Unauthorized",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
          "403": {
            description: "Forbidden",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
          "404": {
            description: "Not found",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
        },
      },
    },
    "/api/scheduling/blackout-windows": {
      get: {
        tags: ["Scheduling"],
        summary: "List blackout windows",
        responses: {
          "200": {
            description: "OK",
            content: { "application/json": { schema: { $ref: "#/components/schemas/SchedulingBlackoutWindowListResponse" } } },
          },
          "401": {
            description: "Unauthorized",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
        },
      },
      post: {
        tags: ["Scheduling"],
        summary: "Create blackout window",
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/SchedulingBlackoutWindowCreateRequest" } },
          },
        },
        responses: {
          "201": {
            description: "Created",
            content: { "application/json": { schema: { $ref: "#/components/schemas/IdResponse" } } },
          },
          "400": {
            description: "Invalid request",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
          "401": {
            description: "Unauthorized",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
          "403": {
            description: "Forbidden",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
        },
      },
    },
    "/api/scheduling/blackout-windows/{blackoutWindowId}": {
      put: {
        tags: ["Scheduling"],
        summary: "Update blackout window",
        parameters: [
          {
            name: "blackoutWindowId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/SchedulingBlackoutWindowUpdateRequest" } },
          },
        },
        responses: {
          "200": {
            description: "OK",
            content: { "application/json": { schema: { $ref: "#/components/schemas/OkResponse" } } },
          },
          "400": {
            description: "Invalid request",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
          "401": {
            description: "Unauthorized",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
          "403": {
            description: "Forbidden",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
          "404": {
            description: "Not found",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
        },
      },
      delete: {
        tags: ["Scheduling"],
        summary: "Deactivate blackout window",
        parameters: [
          {
            name: "blackoutWindowId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          "200": {
            description: "OK",
            content: { "application/json": { schema: { $ref: "#/components/schemas/OkResponse" } } },
          },
          "400": {
            description: "Invalid request",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
          "401": {
            description: "Unauthorized",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
          "403": {
            description: "Forbidden",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
          "404": {
            description: "Not found",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
        },
      },
    },
    "/api/scheduling/recalculate": {
      post: {
        tags: ["Scheduling"],
        summary: "Recalculate PM schedules for assets and facilities",
        requestBody: {
          required: false,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/SchedulingRecalculateRequest" } },
          },
        },
        responses: {
          "200": {
            description: "OK",
            content: { "application/json": { schema: { $ref: "#/components/schemas/SchedulingRecalculateResponse" } } },
          },
          "400": {
            description: "Invalid request",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
          "401": {
            description: "Unauthorized",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
          "403": {
            description: "Forbidden",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
        },
      },
    },
    "/api/scheduling/day": {
      get: {
        tags: ["Scheduling"],
        summary: "List scheduled, due, and projected PM tasks for a day",
        parameters: [
          {
            name: "date",
            in: "query",
            required: true,
            description: "UTC date in YYYY-MM-DD format",
            schema: { type: "string", format: "date" },
          },
        ],
        responses: {
          "200": {
            description: "OK",
            content: { "application/json": { schema: { $ref: "#/components/schemas/SchedulingDayEventsResponse" } } },
          },
          "400": {
            description: "Invalid request",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
          "401": {
            description: "Unauthorized",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
        },
      },
    },
    "/api/scheduling/calendar": {
      get: {
        tags: ["Scheduling"],
        summary: "Aggregate PM counts and capacity for a month",
        parameters: [
          {
            name: "month",
            in: "query",
            required: false,
            description: "UTC month in YYYY-MM format (defaults to current month)",
            schema: { type: "string", format: "date" },
          },
        ],
        responses: {
          "200": {
            description: "OK",
            content: { "application/json": { schema: { $ref: "#/components/schemas/SchedulingCalendarResponse" } } },
          },
          "400": {
            description: "Invalid request",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
          "401": {
            description: "Unauthorized",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
        },
      },
    },
  },
};

const allowedOriginsList = String(env.FRONTEND_ORIGIN ?? "")
  .split(/[ ,]+/)
  .map((v) => v.trim())
  .filter((v) => v.length > 0);

const allowAllOrigins = allowedOriginsList.includes("*");
const ngrokOriginPattern = /^https:\/\/[a-z0-9-]+\.ngrok-free\.app$/i;

type OriginMatcher = {
  raw: string;
  test: (origin: string) => boolean;
};

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const originMatchers: OriginMatcher[] = allowedOriginsList
  .filter((v) => v !== "*")
  .map((raw) => {
    if (!raw.includes("*")) {
      return { raw, test: (origin: string) => origin === raw };
    }
    const pattern = "^" + raw.split("*").map(escapeRegex).join(".*") + "$";
    const re = new RegExp(pattern, "i");
    return { raw, test: (origin: string) => re.test(origin) };
  });

const originConfig: CorsOptions["origin"] = (origin, callback) => {
  if (allowAllOrigins) {
    callback(null, true);
    return;
  }

  if (!origin) {
    callback(null, true);
    return;
  }

  if (ngrokOriginPattern.test(origin) || originMatchers.some((m) => m.test(origin))) {
    callback(null, true);
    return;
  }

  callback(new Error("Not allowed by CORS"));
};

app.use(
  cors({
    origin: originConfig,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-filename"],
    exposedHeaders: ["Content-Disposition"],
  }),
);

app.options(
  "*",
  cors({
    origin: originConfig,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-filename"],
    exposedHeaders: ["Content-Disposition"],
  }),
);

app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/api/docs.json", (_req, res) => {
  res.json(openApiSpec);
});

app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(openApiSpec));

app.use("/api/auth", authRouter);
app.use("/api/assets", assetsRouter);
app.use("/api/facilities", facilitiesRouter);
app.use("/api/templates", templatesRouter);
app.use("/api/scheduling", schedulingRouter);
app.use("/api/tasks", tasksRouter);
app.use("/api/work-orders", workOrdersRouter);
app.use("/api/reports", reportsRouter);
app.use("/api/notifications", notificationsRouter);
app.use("/api/system", systemRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/devices", devicesRouter);

app.listen(env.BACKEND_PORT, () => {
  process.stdout.write(`Backend listening on http://localhost:${env.BACKEND_PORT}\n`);
  void startJobs();
});
