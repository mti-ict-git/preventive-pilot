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
import { appUpdatesRouter } from "./routes/appUpdates.js";
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
    description: "REST API for Preventive Pilot (web + mobile clients). Docs updated 2026-09-27.",
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
      "EvidenceImportRunRequest": {
        "type": "object",
        "properties": {
          "templateId": {
            "type": [
              "string",
              "null"
            ],
            "format": "uuid"
          },
          "duplicateAction": {
            "type": "string",
            "enum": [
              "skip",
              "replace"
            ],
            "default": "skip"
          },
          "maxFiles": {
            "type": "integer",
            "minimum": 1,
            "maximum": 20000
          },
          "dryRun": {
            "type": "boolean"
          }
        }
      },
      "CreateLocalUserRequest": {
        "type": "object",
        "properties": {
          "username": {
            "type": "string",
            "minLength": 1,
            "maxLength": 128
          },
          "displayName": {
            "type": [
              "string",
              "null"
            ],
            "maxLength": 256
          },
          "email": {
            "type": [
              "string",
              "null"
            ],
            "format": "email",
            "maxLength": 256
          },
          "phone": {
            "type": [
              "string",
              "null"
            ],
            "maxLength": 32
          },
          "password": {
            "type": "string",
            "minLength": 6,
            "maxLength": 128
          },
          "roleName": {
            "type": "string",
            "minLength": 1,
            "maxLength": 64
          },
          "isActive": {
            "type": "boolean",
            "default": true
          }
        },
        "required": [
          "username",
          "password",
          "roleName"
        ]
      },
      "AssignLdapUserRequest": {
        "type": "object",
        "properties": {
          "identifier": {
            "type": "string",
            "minLength": 1,
            "maxLength": 256
          },
          "roleName": {
            "type": "string",
            "minLength": 1,
            "maxLength": 64
          },
          "isActive": {
            "type": "boolean",
            "default": true
          }
        },
        "required": [
          "identifier",
          "roleName"
        ]
      },
      "SnipeItSettingsUpdateRequest": {
        "type": "object",
        "properties": {
          "baseUrl": {
            "type": [
              "string",
              "null"
            ],
            "maxLength": 512
          },
          "apiToken": {
            "type": [
              "string",
              "null"
            ],
            "maxLength": 2048
          },
          "autoSyncEnabled": {
            "type": "boolean"
          },
          "syncIntervalMinutes": {
            "type": "integer",
            "minimum": 1,
            "maximum": 1440
          }
        },
        "required": [
          "baseUrl",
          "autoSyncEnabled",
          "syncIntervalMinutes"
        ],
        "description": "String settings are trimmed; blank nullable strings normalize to null. Optional secrets preserve existing values when omitted on settings writes. Test overrides use current values for null/omitted fields."
      },
      "SnipeItSettingsTestRequest": {
        "type": "object",
        "properties": {
          "baseUrl": {
            "type": [
              "string",
              "null"
            ],
            "maxLength": 512
          },
          "apiToken": {
            "type": [
              "string",
              "null"
            ],
            "maxLength": 2048
          },
          "autoSyncEnabled": {
            "type": "boolean"
          },
          "syncIntervalMinutes": {
            "type": "integer",
            "minimum": 1,
            "maximum": 1440
          }
        },
        "description": "String settings are trimmed; blank nullable strings normalize to null. Optional secrets preserve existing values when omitted on settings writes. Test overrides use current values for null/omitted fields."
      },
      "MicrosoftGraphSettingsUpdateRequest": {
        "type": "object",
        "properties": {
          "tenantId": {
            "type": [
              "string",
              "null"
            ],
            "maxLength": 64
          },
          "clientId": {
            "type": [
              "string",
              "null"
            ],
            "maxLength": 64
          },
          "clientSecret": {
            "type": [
              "string",
              "null"
            ],
            "maxLength": 2048
          },
          "scope": {
            "type": "array",
            "items": {
              "type": "string",
              "minLength": 1,
              "maxLength": 256
            },
            "maxItems": 20,
            "default": []
          },
          "senderEmail": {
            "type": [
              "string",
              "null"
            ],
            "maxLength": 256
          },
          "useLoggedInUserAsSender": {
            "type": "boolean"
          },
          "defaultToRecipients": {
            "type": "array",
            "items": {
              "type": "string",
              "minLength": 1,
              "maxLength": 256
            },
            "maxItems": 50,
            "default": []
          },
          "defaultCcRecipients": {
            "type": "array",
            "items": {
              "type": "string",
              "minLength": 1,
              "maxLength": 256
            },
            "maxItems": 50,
            "default": []
          },
          "defaultBccRecipients": {
            "type": "array",
            "items": {
              "type": "string",
              "minLength": 1,
              "maxLength": 256
            },
            "maxItems": 50,
            "default": []
          },
          "emailSubjectTemplate": {
            "type": [
              "string",
              "null"
            ],
            "maxLength": 512
          },
          "emailBodyTemplate": {
            "type": [
              "string",
              "null"
            ],
            "maxLength": 20000
          },
          "enabled": {
            "type": "boolean"
          }
        },
        "required": [
          "tenantId",
          "clientId",
          "senderEmail",
          "useLoggedInUserAsSender",
          "emailSubjectTemplate",
          "emailBodyTemplate",
          "enabled"
        ],
        "description": "String settings are trimmed; blank nullable strings normalize to null. Optional secrets preserve existing values when omitted on settings writes. Test overrides use current values for null/omitted fields."
      },
      "MicrosoftGraphSettingsTestRequest": {
        "type": "object",
        "properties": {
          "tenantId": {
            "type": [
              "string",
              "null"
            ],
            "maxLength": 64
          },
          "clientId": {
            "type": [
              "string",
              "null"
            ],
            "maxLength": 64
          },
          "clientSecret": {
            "type": [
              "string",
              "null"
            ],
            "maxLength": 2048
          },
          "scope": {
            "type": "array",
            "items": {
              "type": "string",
              "minLength": 1,
              "maxLength": 256
            },
            "maxItems": 20,
            "default": []
          },
          "senderEmail": {
            "type": [
              "string",
              "null"
            ],
            "maxLength": 256
          },
          "useLoggedInUserAsSender": {
            "type": "boolean"
          },
          "defaultToRecipients": {
            "type": "array",
            "items": {
              "type": "string",
              "minLength": 1,
              "maxLength": 256
            },
            "maxItems": 50,
            "default": []
          },
          "defaultCcRecipients": {
            "type": "array",
            "items": {
              "type": "string",
              "minLength": 1,
              "maxLength": 256
            },
            "maxItems": 50,
            "default": []
          },
          "defaultBccRecipients": {
            "type": "array",
            "items": {
              "type": "string",
              "minLength": 1,
              "maxLength": 256
            },
            "maxItems": 50,
            "default": []
          },
          "emailSubjectTemplate": {
            "type": [
              "string",
              "null"
            ],
            "maxLength": 512
          },
          "emailBodyTemplate": {
            "type": [
              "string",
              "null"
            ],
            "maxLength": 20000
          },
          "enabled": {
            "type": "boolean"
          },
          "sendTestEmail": {
            "type": "boolean"
          }
        },
        "description": "String settings are trimmed; blank nullable strings normalize to null. Optional secrets preserve existing values when omitted on settings writes. Test overrides use current values for null/omitted fields."
      },
      "AssetsUiSettingsRequest": {
        "type": "object",
        "properties": {
          "visibleCategoryIds": {
            "type": [
              "array",
              "null"
            ],
            "items": {
              "type": "string",
              "format": "uuid"
            },
            "minItems": 1
          },
          "excludeInactive": {
            "type": "boolean"
          }
        },
        "required": [
          "visibleCategoryIds"
        ]
      },
      "LabelDesignerUiSettingsRequest": {
        "type": "object",
        "properties": {
          "qrPayloadMode": {
            "type": "string",
            "enum": [
              "assetId",
              "assetTag",
              "snipeItUrl"
            ]
          },
          "gridColumns": {
            "type": "integer",
            "minimum": 1,
            "maximum": 6
          },
          "config": {
            "type": "object",
            "properties": {
              "width": {
                "type": "integer",
                "minimum": 10,
                "maximum": 200
              },
              "height": {
                "type": "integer",
                "minimum": 10,
                "maximum": 200
              },
              "qrSize": {
                "type": "integer",
                "minimum": 5,
                "maximum": 200
              },
              "showAssetTag": {
                "type": "boolean"
              },
              "showAssetName": {
                "type": "boolean"
              },
              "showCategory": {
                "type": "boolean"
              },
              "showLocation": {
                "type": "boolean"
              },
              "showCustomText": {
                "type": "boolean"
              },
              "customText": {
                "type": "string",
                "maxLength": 256
              },
              "fontSize": {
                "type": "integer",
                "minimum": 5,
                "maximum": 24
              },
              "padding": {
                "type": "integer",
                "minimum": 0,
                "maximum": 20
              },
              "borderRadius": {
                "type": "integer",
                "minimum": 0,
                "maximum": 20
              },
              "showBorder": {
                "type": "boolean"
              },
              "showLogo": {
                "type": "boolean"
              },
              "orientation": {
                "type": "string",
                "enum": [
                  "portrait",
                  "landscape"
                ]
              }
            },
            "required": [
              "width",
              "height",
              "qrSize",
              "showAssetTag",
              "showAssetName",
              "showCategory",
              "showLocation",
              "showCustomText",
              "customText",
              "fontSize",
              "padding",
              "borderRadius",
              "showBorder",
              "showLogo",
              "orientation"
            ]
          }
        },
        "required": [
          "qrPayloadMode",
          "gridColumns",
          "config"
        ]
      },
      "WhatsAppSettingsRequest": {
        "type": "object",
        "properties": {
          "enabled": {
            "type": "boolean"
          },
          "baseUrl": {
            "type": [
              "string",
              "null"
            ],
            "maxLength": 512
          },
          "target": {
            "type": "string",
            "enum": [
              "single",
              "group"
            ]
          },
          "defaultNumber": {
            "type": [
              "string",
              "null"
            ],
            "maxLength": 64
          },
          "groupId": {
            "type": [
              "string",
              "null"
            ],
            "maxLength": 128
          },
          "groupName": {
            "type": [
              "string",
              "null"
            ],
            "maxLength": 256
          },
          "mentionNumbers": {
            "type": "array",
            "items": {
              "type": "string",
              "minLength": 1,
              "maxLength": 64
            },
            "maxItems": 50,
            "default": []
          }
        },
        "required": [
          "enabled",
          "baseUrl",
          "target",
          "defaultNumber",
          "groupId",
          "groupName"
        ],
        "description": "String settings are trimmed; blank nullable strings normalize to null. Optional secrets preserve existing values when omitted on settings writes. Test overrides use current values for null/omitted fields."
      },
      "WhatsAppSettingsTestRequest": {
        "type": "object",
        "properties": {
          "enabled": {
            "type": "boolean"
          },
          "baseUrl": {
            "type": [
              "string",
              "null"
            ],
            "maxLength": 512
          },
          "target": {
            "type": "string",
            "enum": [
              "single",
              "group"
            ]
          },
          "defaultNumber": {
            "type": [
              "string",
              "null"
            ],
            "maxLength": 64
          },
          "groupId": {
            "type": [
              "string",
              "null"
            ],
            "maxLength": 128
          },
          "groupName": {
            "type": [
              "string",
              "null"
            ],
            "maxLength": 256
          },
          "mentionNumbers": {
            "type": "array",
            "items": {
              "type": "string",
              "minLength": 1,
              "maxLength": 64
            },
            "maxItems": 50,
            "default": []
          },
          "sendTestMessage": {
            "type": "boolean"
          }
        },
        "description": "String settings are trimmed; blank nullable strings normalize to null. Optional secrets preserve existing values when omitted on settings writes. Test overrides use current values for null/omitted fields."
      },
      "PushTestRequest": {
        "type": "object",
        "properties": {
          "title": {
            "type": "string",
            "minLength": 1,
            "maxLength": 64
          },
          "body": {
            "type": "string",
            "minLength": 1,
            "maxLength": 256
          }
        }
      },
      "SnipeItSettingsResponse": {
        "type": "object",
        "properties": {
          "baseUrl": {
            "type": [
              "string",
              "null"
            ]
          },
          "apiTokenConfigured": {
            "type": "boolean"
          },
          "autoSyncEnabled": {
            "type": "boolean"
          },
          "syncIntervalMinutes": {
            "type": "integer"
          }
        },
        "required": [
          "baseUrl",
          "apiTokenConfigured",
          "autoSyncEnabled",
          "syncIntervalMinutes"
        ]
      },
      "MicrosoftGraphSettingsResponse": {
        "type": "object",
        "properties": {
          "tenantId": {
            "type": [
              "string",
              "null"
            ]
          },
          "clientId": {
            "type": [
              "string",
              "null"
            ]
          },
          "senderEmail": {
            "type": [
              "string",
              "null"
            ]
          },
          "emailSubjectTemplate": {
            "type": [
              "string",
              "null"
            ]
          },
          "emailBodyTemplate": {
            "type": [
              "string",
              "null"
            ]
          },
          "lastConnectionTestAt": {
            "type": [
              "string",
              "null"
            ]
          },
          "clientSecretConfigured": {
            "type": "boolean"
          },
          "useLoggedInUserAsSender": {
            "type": "boolean"
          },
          "enabled": {
            "type": "boolean"
          },
          "scope": {
            "type": "array",
            "items": {
              "type": "string"
            }
          },
          "defaultToRecipients": {
            "type": "array",
            "items": {
              "type": "string"
            }
          },
          "defaultCcRecipients": {
            "type": "array",
            "items": {
              "type": "string"
            }
          },
          "defaultBccRecipients": {
            "type": "array",
            "items": {
              "type": "string"
            }
          }
        },
        "required": [
          "tenantId",
          "clientId",
          "senderEmail",
          "emailSubjectTemplate",
          "emailBodyTemplate",
          "lastConnectionTestAt",
          "clientSecretConfigured",
          "useLoggedInUserAsSender",
          "enabled",
          "scope",
          "defaultToRecipients",
          "defaultCcRecipients",
          "defaultBccRecipients"
        ]
      },
      "WhatsAppSettingsResponse": {
        "type": "object",
        "properties": {
          "enabled": {
            "type": "boolean"
          },
          "baseUrl": {
            "type": [
              "string",
              "null"
            ]
          },
          "target": {
            "type": "string",
            "enum": [
              "single",
              "group"
            ]
          },
          "defaultNumber": {
            "type": [
              "string",
              "null"
            ]
          },
          "groupId": {
            "type": [
              "string",
              "null"
            ]
          },
          "groupName": {
            "type": [
              "string",
              "null"
            ]
          },
          "mentionNumbers": {
            "type": "array",
            "items": {
              "type": "string"
            }
          }
        },
        "required": [
          "enabled",
          "baseUrl",
          "target",
          "defaultNumber",
          "groupId",
          "groupName",
          "mentionNumbers"
        ]
      },
      "AssetsUiSettingsResponse": {
        "type": "object",
        "properties": {
          "visibleCategoryIds": {
            "type": [
              "array",
              "null"
            ],
            "items": {
              "type": "string",
              "format": "uuid"
            }
          },
          "excludeInactive": {
            "type": "boolean"
          }
        },
        "required": [
          "visibleCategoryIds",
          "excludeInactive"
        ]
      },
      "LabelDesignerUiSettingsResponse": {
        "type": "object",
        "properties": {
          "qrPayloadMode": {
            "type": "string",
            "enum": [
              "assetId",
              "assetTag",
              "snipeItUrl"
            ]
          },
          "gridColumns": {
            "type": "integer",
            "minimum": 1,
            "maximum": 6
          },
          "config": {
            "type": "object",
            "properties": {
              "width": {
                "type": "integer",
                "minimum": 10,
                "maximum": 200
              },
              "height": {
                "type": "integer",
                "minimum": 10,
                "maximum": 200
              },
              "qrSize": {
                "type": "integer",
                "minimum": 5,
                "maximum": 200
              },
              "showAssetTag": {
                "type": "boolean"
              },
              "showAssetName": {
                "type": "boolean"
              },
              "showCategory": {
                "type": "boolean"
              },
              "showLocation": {
                "type": "boolean"
              },
              "showCustomText": {
                "type": "boolean"
              },
              "customText": {
                "type": "string",
                "maxLength": 256
              },
              "fontSize": {
                "type": "integer",
                "minimum": 5,
                "maximum": 24
              },
              "padding": {
                "type": "integer",
                "minimum": 0,
                "maximum": 20
              },
              "borderRadius": {
                "type": "integer",
                "minimum": 0,
                "maximum": 20
              },
              "showBorder": {
                "type": "boolean"
              },
              "showLogo": {
                "type": "boolean"
              },
              "orientation": {
                "type": "string",
                "enum": [
                  "portrait",
                  "landscape"
                ]
              }
            },
            "required": [
              "width",
              "height",
              "qrSize",
              "showAssetTag",
              "showAssetName",
              "showCategory",
              "showLocation",
              "showCustomText",
              "customText",
              "fontSize",
              "padding",
              "borderRadius",
              "showBorder",
              "showLogo",
              "orientation"
            ]
          }
        },
        "required": [
          "qrPayloadMode",
          "gridColumns",
          "config"
        ]
      },
      "MicrosoftGraphTestResponse": {
        "type": "object",
        "properties": {
          "ok": {
            "type": "boolean"
          },
          "accessTokenPresent": {
            "type": "boolean"
          },
          "lastConnectionTestAt": {
            "type": "string",
            "format": "date-time"
          },
          "testEmailSent": {
            "type": "boolean"
          }
        },
        "required": [
          "ok",
          "accessTokenPresent",
          "lastConnectionTestAt",
          "testEmailSent"
        ]
      },
      "WhatsAppTestResponse": {
        "type": "object",
        "properties": {
          "ok": {
            "type": "boolean"
          },
          "testMessageSent": {
            "type": "boolean"
          }
        },
        "required": [
          "ok"
        ]
      },
      "SystemStatusResponse": {
        "type": "object",
        "properties": {
          "backendTime": {
            "type": "string",
            "format": "date-time"
          },
          "uptimeSeconds": {
            "type": "integer"
          },
          "database": {
            "type": "object",
            "properties": {
              "ok": {
                "type": "boolean"
              }
            },
            "required": [
              "ok"
            ]
          },
          "jobs": {
            "type": "object",
            "properties": {
              "enabled": {
                "type": "boolean"
              },
              "scheduleCalcIntervalMinutes": {
                "type": "integer"
              },
              "notificationIntervalMinutes": {
                "type": "integer"
              },
              "snipeSyncEnabled": {
                "type": "boolean"
              },
              "snipeSyncIntervalMinutes": {
                "type": "integer"
              }
            },
            "required": [
              "enabled",
              "scheduleCalcIntervalMinutes",
              "notificationIntervalMinutes",
              "snipeSyncEnabled",
              "snipeSyncIntervalMinutes"
            ]
          },
          "notifications": {
            "type": "object",
            "properties": {
              "msGraph": {
                "$ref": "#/components/schemas/MicrosoftGraphSettingsResponse"
              },
              "whatsApp": {
                "$ref": "#/components/schemas/WhatsAppSettingsResponse"
              }
            },
            "required": [
              "msGraph",
              "whatsApp"
            ]
          },
          "snipeIt": {
            "type": "object",
            "properties": {
              "configured": {
                "type": "boolean"
              },
              "baseUrl": {
                "type": [
                  "string",
                  "null"
                ]
              },
              "autoSyncEnabled": {
                "type": "boolean"
              },
              "syncIntervalMinutes": {
                "type": "integer"
              },
              "lastRun": {
                "anyOf": [
                  {
                    "type": "object",
                    "properties": {
                      "id": {
                        "type": "string",
                        "format": "uuid"
                      },
                      "startedAt": {
                        "type": "string",
                        "format": "date-time"
                      },
                      "completedAt": {
                        "type": [
                          "string",
                          "null"
                        ],
                        "format": "date-time"
                      },
                      "status": {
                        "type": "string"
                      },
                      "assetsProcessed": {
                        "type": [
                          "integer",
                          "null"
                        ]
                      },
                      "errorMessage": {
                        "type": [
                          "string",
                          "null"
                        ]
                      }
                    },
                    "required": [
                      "id",
                      "startedAt",
                      "completedAt",
                      "status",
                      "assetsProcessed",
                      "errorMessage"
                    ]
                  },
                  {
                    "type": "null"
                  }
                ]
              }
            },
            "required": [
              "configured",
              "baseUrl",
              "autoSyncEnabled",
              "syncIntervalMinutes",
              "lastRun"
            ]
          }
        },
        "required": [
          "backendTime",
          "uptimeSeconds",
          "database",
          "jobs",
          "notifications",
          "snipeIt"
        ]
      },
      "AssignableUsersResponse": {
        "type": "object",
        "properties": {
          "page": {
            "type": "integer"
          },
          "pageSize": {
            "type": "integer"
          },
          "total": {
            "type": "integer"
          },
          "items": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "id": {
                  "type": "string"
                },
                "username": {
                  "type": "string"
                },
                "displayName": {
                  "type": [
                    "string",
                    "null"
                  ]
                },
                "email": {
                  "type": [
                    "string",
                    "null"
                  ]
                },
                "phone": {
                  "type": [
                    "string",
                    "null"
                  ]
                },
                "externalProvider": {
                  "type": [
                    "string",
                    "null"
                  ]
                },
                "isActive": {
                  "type": "boolean"
                },
                "roles": {
                  "type": "array",
                  "items": {
                    "type": "string"
                  }
                },
                "tasksCompleted": {
                  "type": "integer"
                }
              },
              "required": [
                "id",
                "username",
                "displayName",
                "email",
                "phone",
                "externalProvider",
                "isActive",
                "roles",
                "tasksCompleted"
              ]
            }
          }
        },
        "required": [
          "page",
          "pageSize",
          "total",
          "items"
        ]
      },
      "LdapSearchResponse": {
        "type": "object",
        "properties": {
          "items": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "username": {
                  "type": "string"
                },
                "displayName": {
                  "type": [
                    "string",
                    "null"
                  ]
                },
                "email": {
                  "type": [
                    "string",
                    "null"
                  ]
                },
                "upn": {
                  "type": [
                    "string",
                    "null"
                  ]
                },
                "dn": {
                  "type": "string"
                },
                "identifier": {
                  "type": "string"
                }
              },
              "required": [
                "username",
                "displayName",
                "email",
                "upn",
                "dn",
                "identifier"
              ]
            }
          }
        },
        "required": [
          "items"
        ]
      },
      "EvidenceImportResponse": {
        "type": "object",
        "properties": {
          "examined": {
            "type": "integer"
          },
          "importedFiles": {
            "type": "integer"
          },
          "skippedFiles": {
            "type": "integer"
          },
          "errorFiles": {
            "type": "integer"
          },
          "createdTasks": {
            "type": "integer"
          },
          "replacedTasks": {
            "type": "integer"
          },
          "skipReasons": {
            "type": "object",
            "properties": {
              "no_date_in_name": {
                "type": "integer"
              },
              "no_asset_key": {
                "type": "integer"
              },
              "asset_not_found": {
                "type": "integer"
              },
              "no_template": {
                "type": "integer"
              },
              "not_regular_file": {
                "type": "integer"
              },
              "duplicate_task": {
                "type": "integer"
              }
            },
            "required": []
          },
          "errorStages": {
            "type": "object",
            "properties": {
              "storage_path_escape": {
                "type": "integer"
              },
              "stat_failed": {
                "type": "integer"
              },
              "move_failed": {
                "type": "integer"
              },
              "task_ensure_failed": {
                "type": "integer"
              },
              "db_exception": {
                "type": "integer"
              }
            },
            "required": []
          },
          "skippedSamples": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "fileName": {
                  "type": "string"
                },
                "assetKey": {
                  "type": [
                    "string",
                    "null"
                  ]
                },
                "date": {
                  "type": [
                    "string",
                    "null"
                  ]
                },
                "reason": {
                  "type": "string",
                  "enum": [
                    "no_date_in_name",
                    "no_asset_key",
                    "asset_not_found",
                    "no_template",
                    "not_regular_file",
                    "duplicate_task"
                  ]
                },
                "detail": {
                  "type": [
                    "string",
                    "null"
                  ]
                }
              },
              "required": [
                "fileName",
                "assetKey",
                "date",
                "reason",
                "detail"
              ]
            }
          },
          "errorSamples": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "fileName": {
                  "type": "string"
                },
                "assetKey": {
                  "type": [
                    "string",
                    "null"
                  ]
                },
                "date": {
                  "type": [
                    "string",
                    "null"
                  ]
                },
                "stage": {
                  "type": "string",
                  "enum": [
                    "storage_path_escape",
                    "stat_failed",
                    "move_failed",
                    "task_ensure_failed",
                    "db_exception"
                  ]
                },
                "error": {
                  "type": [
                    "string",
                    "null"
                  ]
                }
              },
              "required": [
                "fileName",
                "assetKey",
                "date",
                "stage",
                "error"
              ]
            }
          }
        },
        "required": [
          "examined",
          "importedFiles",
          "skippedFiles",
          "errorFiles",
          "createdTasks",
          "replacedTasks",
          "skipReasons",
          "errorStages",
          "skippedSamples",
          "errorSamples"
        ]
      },
      "PushTestResponse": {
        "type": "object",
        "properties": {
          "ok": {
            "type": "boolean"
          },
          "attempted": {
            "type": "integer"
          },
          "sent": {
            "type": "integer"
          },
          "failed": {
            "type": "integer"
          },
          "configUsed": {
            "type": "string",
            "enum": [
              "firebase-admin",
              "fcm-legacy"
            ]
          },
          "failures": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "platform": {
                  "type": "string"
                },
                "message": {
                  "type": "string"
                },
                "code": {
                  "type": [
                    "string",
                    "null"
                  ]
                }
              },
              "required": [
                "platform",
                "message",
                "code"
              ]
            }
          }
        },
        "required": [
          "ok",
          "attempted",
          "sent",
          "failed",
          "configUsed",
          "failures"
        ]
      },

      "FacilityDetail": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "format": "uuid"
          },
          "name": {
            "type": "string"
          },
          "description": {
            "type": [
              "string",
              "null"
            ]
          },
          "isActive": {
            "type": "boolean"
          },
          "location": {
            "anyOf": [
              {
                "$ref": "#/components/schemas/EntityRef"
              },
              {
                "type": "null"
              }
            ]
          },
          "pm": {
            "$ref": "#/components/schemas/FacilityPmInfo"
          }
        },
        "required": [
          "id",
          "name",
          "description",
          "isActive",
          "location",
          "pm"
        ]
      },
      "TemplateChecklistItemRequest": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "format": "uuid"
          },
          "sortOrder": {
            "type": "integer",
            "minimum": 0
          },
          "itemText": {
            "type": "string",
            "minLength": 1,
            "maxLength": 512
          },
          "isMandatory": {
            "type": "boolean",
            "default": true
          },
          "requiresNotes": {
            "type": "boolean",
            "default": false
          },
          "requiresPassFail": {
            "type": "boolean",
            "default": true
          },
          "enableAttachment": {
            "type": "boolean",
            "default": false
          },
          "requiresAttachment": {
            "type": "boolean",
            "default": false
          },
          "isActive": {
            "type": "boolean",
            "default": true
          }
        },
        "required": [
          "sortOrder",
          "itemText"
        ]
      },
      "TemplateChecklistItem": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "format": "uuid"
          },
          "sortOrder": {
            "type": "integer",
            "minimum": 0
          },
          "itemText": {
            "type": "string",
            "minLength": 1,
            "maxLength": 512
          },
          "isMandatory": {
            "type": "boolean"
          },
          "requiresNotes": {
            "type": "boolean"
          },
          "requiresPassFail": {
            "type": "boolean"
          },
          "enableAttachment": {
            "type": "boolean"
          },
          "requiresAttachment": {
            "type": "boolean"
          },
          "isActive": {
            "type": "boolean"
          }
        },
        "required": [
          "id",
          "sortOrder",
          "itemText",
          "isMandatory",
          "requiresNotes",
          "requiresPassFail",
          "enableAttachment",
          "requiresAttachment",
          "isActive"
        ]
      },
      "TemplateCreateRequest": {
        "type": "object",
        "properties": {
          "name": {
            "type": "string",
            "minLength": 1,
            "maxLength": 256
          },
          "description": {
            "type": [
              "string",
              "null"
            ],
            "maxLength": 1024
          },
          "intervalDays": {
            "type": "integer",
            "minimum": 1
          },
          "applicableCategoryId": {
            "type": [
              "string",
              "null"
            ],
            "format": "uuid"
          },
          "estimatedDurationMinutes": {
            "type": [
              "integer",
              "null"
            ],
            "minimum": 1
          },
          "requiredRoleId": {
            "type": [
              "string",
              "null"
            ],
            "format": "uuid"
          },
          "isActive": {
            "type": "boolean",
            "default": true
          },
          "checklistItems": {
            "type": "array",
            "items": {
              "$ref": "#/components/schemas/TemplateChecklistItemRequest"
            },
            "default": []
          }
        },
        "required": [
          "name",
          "intervalDays"
        ]
      },
      "TemplateUpdateRequest": {
        "type": "object",
        "properties": {
          "name": {
            "type": "string",
            "minLength": 1,
            "maxLength": 256
          },
          "description": {
            "type": [
              "string",
              "null"
            ],
            "maxLength": 1024
          },
          "intervalDays": {
            "type": "integer",
            "minimum": 1
          },
          "applicableCategoryId": {
            "type": [
              "string",
              "null"
            ],
            "format": "uuid"
          },
          "estimatedDurationMinutes": {
            "type": [
              "integer",
              "null"
            ],
            "minimum": 1
          },
          "requiredRoleId": {
            "type": [
              "string",
              "null"
            ],
            "format": "uuid"
          },
          "isActive": {
            "type": "boolean"
          },
          "checklistItems": {
            "type": "array",
            "items": {
              "$ref": "#/components/schemas/TemplateChecklistItemRequest"
            }
          }
        },
        "description": "Partial update. Empty object is accepted. Supplied checklistItems replaces the active set: omitted existing IDs are deactivated; omitted checklistItems leaves items unchanged. Version increments on each accepted update."
      },
      "TemplateSummary": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "format": "uuid"
          },
          "name": {
            "type": "string"
          },
          "description": {
            "type": [
              "string",
              "null"
            ]
          },
          "intervalDays": {
            "type": "integer"
          },
          "applicableCategory": {
            "anyOf": [
              {
                "$ref": "#/components/schemas/EntityRef"
              },
              {
                "type": "null"
              }
            ]
          },
          "estimatedDurationMinutes": {
            "type": [
              "integer",
              "null"
            ]
          },
          "requiredRole": {
            "anyOf": [
              {
                "$ref": "#/components/schemas/EntityRef"
              },
              {
                "type": "null"
              }
            ]
          },
          "isActive": {
            "type": "boolean"
          },
          "version": {
            "type": "integer"
          },
          "updatedAt": {
            "type": "string",
            "format": "date-time"
          }
        },
        "required": [
          "id",
          "name",
          "description",
          "intervalDays",
          "applicableCategory",
          "estimatedDurationMinutes",
          "requiredRole",
          "isActive",
          "version",
          "updatedAt"
        ]
      },
      "TemplateDetail": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "format": "uuid"
          },
          "name": {
            "type": "string"
          },
          "description": {
            "type": [
              "string",
              "null"
            ]
          },
          "intervalDays": {
            "type": "integer"
          },
          "applicableCategory": {
            "anyOf": [
              {
                "$ref": "#/components/schemas/EntityRef"
              },
              {
                "type": "null"
              }
            ]
          },
          "estimatedDurationMinutes": {
            "type": [
              "integer",
              "null"
            ]
          },
          "requiredRole": {
            "anyOf": [
              {
                "$ref": "#/components/schemas/EntityRef"
              },
              {
                "type": "null"
              }
            ]
          },
          "isActive": {
            "type": "boolean"
          },
          "version": {
            "type": "integer"
          },
          "updatedAt": {
            "type": "string",
            "format": "date-time"
          },
          "checklistItems": {
            "type": "array",
            "items": {
              "$ref": "#/components/schemas/TemplateChecklistItem"
            }
          }
        },
        "required": [
          "id",
          "name",
          "description",
          "intervalDays",
          "applicableCategory",
          "estimatedDurationMinutes",
          "requiredRole",
          "isActive",
          "version",
          "updatedAt",
          "checklistItems"
        ]
      },
      "TemplateListResponse": {
        "type": "object",
        "properties": {
          "items": {
            "type": "array",
            "items": {
              "$ref": "#/components/schemas/TemplateSummary"
            }
          }
        },
        "required": [
          "items"
        ]
      },
      "UserPreferences": {
        "type": "object",
        "properties": {
          "themeMode": {
            "type": [
              "string",
              "null"
            ]
          },
          "themePalette": {
            "type": [
              "string",
              "null"
            ]
          }
        },
        "required": [
          "themeMode",
          "themePalette"
        ]
      },
      "UserPreferencesRequest": {
        "type": "object",
        "properties": {
          "themeMode": {
            "type": [
              "string",
              "null"
            ],
            "enum": [
              "dark",
              "light",
              null
            ]
          },
          "themePalette": {
            "type": [
              "string",
              "null"
            ],
            "maxLength": 64,
            "description": "Trimmed before storage."
          }
        }
      },
      "BulkAssignUnassignedRequest": {
        "type": "object",
        "properties": {
          "assignedToUserId": {
            "type": "string",
            "format": "uuid"
          },
          "assignedToRoleId": {
            "type": "string",
            "format": "uuid"
          },
          "dueFrom": {
            "type": "string",
            "description": "Date or parseable timestamp; date-only uses UTC 00:00:00 inclusive."
          },
          "dueTo": {
            "type": "string",
            "description": "Date or parseable timestamp; date-only uses UTC 23:59:59 inclusive."
          }
        },
        "oneOf": [
          {
            "required": [
              "assignedToUserId"
            ],
            "not": {
              "required": [
                "assignedToRoleId"
              ]
            }
          },
          {
            "required": [
              "assignedToRoleId"
            ],
            "not": {
              "required": [
                "assignedToUserId"
              ]
            }
          }
        ]
      },
      "BulkAssignUnassignedResponse": {
        "type": "object",
        "properties": {
          "ok": {
            "type": "boolean"
          },
          "updatedCount": {
            "type": "integer"
          }
        },
        "required": [
          "ok",
          "updatedCount"
        ]
      },
      "WorkOrderResolutionRequest": {
        "type": "object",
        "properties": {
          "resolutionNotes": {
            "type": "string",
            "maxLength": 2048,
            "description": "Trimmed. Empty or omitted value clears the notes."
          }
        }
      },

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
          nextPlannedDueAt: { type: ["string", "null"], format: "date-time" },
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
          nextPlannedDueAt: { type: ["string", "null"], format: "date-time" },
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
      WorkOrderCreateResponse: {
        type: "object",
        properties: {
          id: { type: "string" },
          created: { type: "boolean" },
        },
        required: ["id", "created"],
        additionalProperties: false,
      },
      RejectApprovalResponse: {
        type: "object",
        properties: {
          ok: { type: "boolean" },
          replacementTaskId: { type: "string", format: "uuid" },
        },
        required: ["ok", "replacementTaskId"],
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
      SkipNextPmRequest: {
        type: "object",
        properties: {
          plannedDueAt: { type: "string", format: "date-time" },
          reason: { type: "string", minLength: 1, maxLength: 1024 },
        },
        required: ["plannedDueAt", "reason"],
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
      PushBroadcastRequest: {
        type: "object",
        properties: {
          title: { type: "string", maxLength: 120 },
          body: { type: "string", maxLength: 2000 },
          audience: { type: "string", enum: ["all", "technician", "supervisor", "superadmin"], default: "all" },
        },
        required: ["title", "body"],
        additionalProperties: false,
      },
      PushBroadcastError: {
        type: "object",
        properties: {
          token: { type: "string" },
          message: { type: "string" },
          code: { type: ["string", "null"] },
        },
        required: ["token", "message"],
        additionalProperties: false,
      },
      PushBroadcastResponse: {
        type: "object",
        properties: {
          ok: { type: "boolean" },
          attempted: { type: "integer" },
          sent: { type: "integer" },
          failed: { type: "integer" },
          configUsed: { type: "string", enum: ["firebase-admin", "fcm-legacy"] },
          errors: { type: "array", items: { $ref: "#/components/schemas/PushBroadcastError" } },
        },
        required: ["ok", "attempted", "sent", "failed", "configUsed", "errors"],
        additionalProperties: false,
      },
      TaskAssignRequest: {
        type: "object",
        properties: {
          assignedToUserId: { type: ["string", "null"], format: "uuid" },
          assignedToRoleId: { type: ["string", "null"], format: "uuid" },
          priority: { type: "string", maxLength: 16 },
        },
        minProperties: 1,
        additionalProperties: false,
      },
      TaskClaimResponse: {
        type: "object",
        properties: {
          ok: { type: "boolean" },
          claimed: { type: "boolean" },
        },
        required: ["ok", "claimed"],
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
          sourceTaskId: { type: ["string", "null"], format: "uuid" },
          sourceTemplateChecklistItemId: { type: ["string", "null"], format: "uuid" },
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
      WorkOrderRestorationRequest: {
        type: "object",
        properties: {
          restoredAt: { type: ["string", "null"], format: "date-time" },
          reason: { type: ["string", "null"], maxLength: 1024 },
        },
        additionalProperties: false,
      },
      WorkOrderReturnForCorrectionRequest: {
        type: "object",
        properties: {
          reason: { type: "string", minLength: 1, maxLength: 1024 },
        },
        required: ["reason"],
        additionalProperties: false,
      },
      WorkOrderReopenDowntimeRequest: {
        type: "object",
        properties: {
          downtimeStartedAt: { type: ["string", "null"], format: "date-time" },
          reason: { type: ["string", "null"], maxLength: 1024 },
        },
        additionalProperties: false,
      },
      WorkOrderReportRecurrenceRequest: {
        type: "object",
        properties: {
          downtimeStartedAt: { type: ["string", "null"], format: "date-time" },
          reportedChannel: { type: ["string", "null"], maxLength: 32 },
          reason: { type: ["string", "null"], maxLength: 1024 },
        },
        additionalProperties: false,
      },
      TaskUserRef: {
        type: "object",
        properties: {
          userId: { type: "string", format: "uuid" },
          username: { type: ["string", "null"] },
          displayName: { type: ["string", "null"] },
        },
        required: ["userId", "username", "displayName"],
        additionalProperties: false,
      },
      WorkOrderDowntimeInterval: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          startedAt: { type: "string", format: "date-time" },
          startedReason: { type: ["string", "null"] },
          startedBy: { oneOf: [{ $ref: "#/components/schemas/TaskUserRef" }, { type: "null" }] },
          endedAt: { type: ["string", "null"], format: "date-time" },
          endReason: { type: ["string", "null"] },
          endedBy: { oneOf: [{ $ref: "#/components/schemas/TaskUserRef" }, { type: "null" }] },
        },
        required: ["id", "startedAt", "startedReason", "startedBy", "endedAt", "endReason", "endedBy"],
        additionalProperties: false,
      },
      CmTaskEvent: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          type: {
            type: "string",
            enum: [
              "reported",
              "repair_submitted",
              "returned_for_correction",
              "verified_closed",
              "restoration_recorded",
              "downtime_reopened",
              "repeat_fault_linked",
            ],
          },
          occurredAt: { type: "string", format: "date-time" },
          reason: { type: ["string", "null"] },
          notes: { type: ["string", "null"] },
          metadataJson: { type: ["string", "null"] },
          actor: { oneOf: [{ $ref: "#/components/schemas/TaskUserRef" }, { type: "null" }] },
        },
        required: ["id", "type", "occurredAt", "reason", "notes", "metadataJson", "actor"],
        additionalProperties: false,
      },
      TaskEvidence: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          fileName: { type: ["string", "null"] },
          contentType: { type: ["string", "null"] },
          sizeBytes: { type: ["integer", "null"] },
          uri: { type: "string" },
          uploadedAt: { type: "string", format: "date-time" },
          uploadedBy: { oneOf: [{ $ref: "#/components/schemas/TaskUserRef" }, { type: "null" }] },
        },
        required: ["id", "fileName", "contentType", "sizeBytes", "uri", "uploadedAt", "uploadedBy"],
        additionalProperties: false,
      },
      TaskChecklistEvidence: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          templateChecklistItemId: { type: "string", format: "uuid" },
          fileName: { type: ["string", "null"] },
          contentType: { type: ["string", "null"] },
          sizeBytes: { type: ["integer", "null"] },
          uri: { type: "string" },
          uploadedAt: { type: "string", format: "date-time" },
          uploadedBy: { oneOf: [{ $ref: "#/components/schemas/TaskUserRef" }, { type: "null" }] },
        },
        required: ["id", "templateChecklistItemId", "fileName", "contentType", "sizeBytes", "uri", "uploadedAt", "uploadedBy"],
        additionalProperties: false,
      },
      TaskChecklistResultDetail: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          outcome: { type: "integer", enum: [0, 1, 2] },
          outcomeLabel: { type: "string", enum: ["skip", "pass", "fail", "done"] },
          notes: { type: ["string", "null"] },
          completedAt: { type: ["string", "null"], format: "date-time" },
          completedBy: { oneOf: [{ $ref: "#/components/schemas/TaskUserRef" }, { type: "null" }] },
        },
        required: ["id", "outcome", "outcomeLabel", "notes", "completedAt", "completedBy"],
        additionalProperties: false,
      },
      TaskDetailChecklistItem: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          sortOrder: { type: "integer" },
          itemText: { type: "string" },
          isMandatory: { type: "boolean" },
          requiresNotes: { type: "boolean" },
          requiresPassFail: { type: "boolean" },
          enableAttachment: { type: "boolean" },
          requiresAttachment: { type: "boolean" },
          isActive: { type: "boolean" },
          evidence: { type: "array", items: { $ref: "#/components/schemas/TaskChecklistEvidence" } },
          result: { oneOf: [{ $ref: "#/components/schemas/TaskChecklistResultDetail" }, { type: "null" }] },
        },
        required: [
          "id",
          "sortOrder",
          "itemText",
          "isMandatory",
          "requiresNotes",
          "requiresPassFail",
          "enableAttachment",
          "requiresAttachment",
          "isActive",
          "evidence",
          "result",
        ],
        additionalProperties: false,
      },
      TaskDetailRemark: {
        type: "object",
        properties: {
          label: { type: "string" },
          note: { type: ["string", "null"] },
          at: { type: ["string", "null"], format: "date-time" },
          by: { oneOf: [{ $ref: "#/components/schemas/TaskUserRef" }, { type: "null" }] },
        },
        required: ["label", "note", "at", "by"],
        additionalProperties: false,
      },
      TaskWorkSessionSummary: {
        type: "object",
        properties: {
          totalSeconds: { type: "integer", minimum: 0 },
          sessionCount: { type: "integer", minimum: 0 },
          activeSessionStartedAt: { type: ["string", "null"], format: "date-time" },
        },
        required: ["totalSeconds", "sessionCount", "activeSessionStartedAt"],
        additionalProperties: false,
      },
      TaskDetailResponse: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          taskNumber: { type: "string" },
          maintenanceType: { type: "string", enum: ["PM", "CM"] },
          status: { type: "string" },
          priority: { type: "string" },
          plannedDueAt: { type: "string", format: "date-time" },
          scheduledDueAt: { type: "string", format: "date-time" },
          createdAt: { type: "string", format: "date-time" },
          startedAt: { type: ["string", "null"], format: "date-time" },
          completedAt: { type: ["string", "null"], format: "date-time" },
          completedBy: { oneOf: [{ $ref: "#/components/schemas/TaskUserRef" }, { type: "null" }] },
          cancelledAt: { type: ["string", "null"], format: "date-time" },
          cancelledBy: { oneOf: [{ $ref: "#/components/schemas/TaskUserRef" }, { type: "null" }] },
          cancelledReason: { type: ["string", "null"] },
          forceCompleted: { type: ["boolean", "null"] },
          fulfilledPlannedDueAt: { type: ["string", "null"], format: "date-time" },
          approvalStatus: { type: ["string", "null"] },
          technicianCompletedAt: { type: ["string", "null"], format: "date-time" },
          technicianCompletedBy: { oneOf: [{ $ref: "#/components/schemas/TaskUserRef" }, { type: "null" }] },
          supervisorApprovedAt: { type: ["string", "null"], format: "date-time" },
          supervisorApprovedBy: { oneOf: [{ $ref: "#/components/schemas/TaskUserRef" }, { type: "null" }] },
          superadminApprovedAt: { type: ["string", "null"], format: "date-time" },
          superadminApprovedBy: { oneOf: [{ $ref: "#/components/schemas/TaskUserRef" }, { type: "null" }] },
          rejectedAt: { type: ["string", "null"], format: "date-time" },
          rejectedBy: { oneOf: [{ $ref: "#/components/schemas/TaskUserRef" }, { type: "null" }] },
          rejectionReason: { type: ["string", "null"] },
          revisedAt: { type: ["string", "null"], format: "date-time" },
          revisedBy: { oneOf: [{ $ref: "#/components/schemas/TaskUserRef" }, { type: "null" }] },
          revisionNote: { type: ["string", "null"] },
          workSessionSummary: { oneOf: [{ $ref: "#/components/schemas/TaskWorkSessionSummary" }, { type: "null" }] },
          remarksHistory: { type: "array", items: { $ref: "#/components/schemas/TaskDetailRemark" } },
          asset: {
            type: "object",
            properties: {
              id: { type: "string", format: "uuid" },
              assetTag: { type: "string" },
              name: { type: "string" },
            },
            required: ["id", "assetTag", "name"],
            additionalProperties: false,
          },
          facility: {
            oneOf: [
              {
                type: "object",
                properties: {
                  id: { type: "string", format: "uuid" },
                  name: { type: ["string", "null"] },
                },
                required: ["id", "name"],
                additionalProperties: false,
              },
              { type: "null" },
            ],
          },
          template: {
            type: "object",
            properties: {
              id: { type: "string", format: "uuid" },
              name: { type: "string" },
            },
            required: ["id", "name"],
            additionalProperties: false,
          },
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
          checklistDefinitionSource: {
            type: "string",
            enum: ["live", "snapshot", "legacy-live"],
            description: "Checklist provenance. `legacy-live` means the task predates snapshot preservation and is showing the current template as an explicit fallback.",
          },
          checklistDefinitionCapturedAt: { type: ["string", "null"], format: "date-time" },
          checklistDefinitionNote: { type: ["string", "null"] },
          checklistItems: { type: "array", items: { $ref: "#/components/schemas/TaskDetailChecklistItem" } },
          evidence: { type: "array", items: { $ref: "#/components/schemas/TaskEvidence" } },
        },
        required: [
          "id",
          "taskNumber",
          "maintenanceType",
          "status",
          "priority",
          "plannedDueAt",
          "scheduledDueAt",
          "createdAt",
          "startedAt",
          "completedAt",
          "completedBy",
          "cancelledAt",
          "cancelledBy",
          "cancelledReason",
          "forceCompleted",
          "approvalStatus",
          "technicianCompletedAt",
          "technicianCompletedBy",
          "supervisorApprovedAt",
          "supervisorApprovedBy",
          "superadminApprovedAt",
          "superadminApprovedBy",
          "rejectedAt",
          "rejectedBy",
          "rejectionReason",
          "revisedAt",
          "revisedBy",
          "revisionNote",
          "workSessionSummary",
          "asset",
          "facility",
          "template",
          "assignedTo",
          "checklistDefinitionSource",
          "checklistDefinitionCapturedAt",
          "checklistDefinitionNote",
          "checklistItems",
          "evidence",
        ],
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
          type: { type: "string", enum: ["scheduled", "due", "overdue", "pending", "completed", "completed-late"] },
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
          completedAt: { type: ["string", "null"], format: "date-time" },
          replacedTaskNumber: { type: ["string", "null"] },
          status: { type: "string" },
          priority: { type: "string" },
          estimatedMinutes: { type: "integer" },
          bucket: { type: "string", enum: ["scheduled", "due", "overdue", "pending", "completed", "completed-late"] },
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
          repairSubmittedAt: { type: ["string", "null"], format: "date-time" },
          repairSubmittedBy: { oneOf: [{ $ref: "#/components/schemas/TaskUserRef" }, { type: "null" }] },
          completedAt: { type: ["string", "null"], format: "date-time" },
          cancelledAt: { type: ["string", "null"], format: "date-time" },
          symptom: { type: ["string", "null"] },
          impactLevel: { type: ["string", "null"] },
          failureCategory: { type: ["string", "null"] },
          failureCode: { type: ["string", "null"] },
          downtimeStartedAt: { type: ["string", "null"], format: "date-time" },
          downtimeEndedAt: { type: ["string", "null"], format: "date-time" },
          downtimeTotalSeconds: { type: "integer", minimum: 0 },
          downtimeIntervals: { type: "array", items: { $ref: "#/components/schemas/WorkOrderDowntimeInterval" } },
          reportedAt: { type: ["string", "null"], format: "date-time" },
          reportedChannel: { type: ["string", "null"] },
          reportedBy: { oneOf: [{ $ref: "#/components/schemas/TaskUserRef" }, { type: "null" }] },
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
          completedBy: { oneOf: [{ $ref: "#/components/schemas/TaskUserRef" }, { type: "null" }] },
          returnedAt: { type: ["string", "null"], format: "date-time" },
          returnedBy: { oneOf: [{ $ref: "#/components/schemas/TaskUserRef" }, { type: "null" }] },
          returnReason: { type: ["string", "null"] },
          cancelledBy: { oneOf: [{ $ref: "#/components/schemas/TaskUserRef" }, { type: "null" }] },
          recurringFromTaskId: { type: ["string", "null"], format: "uuid" },
          history: { type: "array", items: { $ref: "#/components/schemas/CmTaskEvent" } },
          resolutionNotes: { type: ["string", "null"] },
        },
        required: [
          "id",
          "taskNumber",
          "status",
          "createdAt",
          "startedAt",
          "repairSubmittedAt",
          "repairSubmittedBy",
          "completedAt",
          "cancelledAt",
          "symptom",
          "impactLevel",
          "failureCategory",
          "failureCode",
          "downtimeStartedAt",
          "downtimeEndedAt",
          "downtimeTotalSeconds",
          "downtimeIntervals",
          "reportedAt",
          "reportedChannel",
          "reportedBy",
          "asset",
          "facility",
          "template",
          "assignedTo",
          "completedBy",
          "returnedAt",
          "returnedBy",
          "returnReason",
          "cancelledBy",
          "recurringFromTaskId",
          "history",
          "resolutionNotes",
        ],
        additionalProperties: false,
      },
      DashboardOverviewStats: {
        type: "object",
        properties: {
          totalAssetsInPm: { type: "integer" },
          upcoming7DaysCount: { type: "integer" },
          dueTodayCount: { type: "integer" },
          overdueCount: { type: "integer" },
        },
        required: ["totalAssetsInPm", "upcoming7DaysCount", "dueTodayCount", "overdueCount"],
        additionalProperties: false,
      },
      DashboardComplianceTrendRow: {
        type: "object",
        properties: {
          monthStart: { type: "string", format: "date-time" },
          monthEnd: { type: "string", format: "date-time" },
          totalDue: { type: "integer" },
          completedOnTime: { type: "integer" },
          complianceRate: { type: ["number", "null"] },
        },
        required: ["monthStart", "monthEnd", "totalDue", "completedOnTime", "complianceRate"],
        additionalProperties: false,
      },
      DashboardOverdueCategoryRow: {
        type: "object",
        properties: {
          name: { type: "string" },
          count: { type: "integer" },
        },
        required: ["name", "count"],
        additionalProperties: false,
      },
      DashboardOverdueAssetRow: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          assetTag: { type: ["string", "null"] },
          name: { type: ["string", "null"] },
        },
        required: ["id", "assetTag", "name"],
        additionalProperties: false,
      },
      DashboardRecentTaskRow: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          taskNumber: { type: "string" },
          status: { type: "string" },
          scheduledDueAt: { type: "string", format: "date-time" },
          asset: {
            type: "object",
            properties: {
              id: { type: "string", format: "uuid" },
              assetTag: { type: ["string", "null"] },
              name: { type: ["string", "null"] },
              imageUrl: { type: ["string", "null"], format: "uri" },
            },
            required: ["id", "assetTag", "name", "imageUrl"],
            additionalProperties: false,
          },
          template: {
            type: "object",
            properties: {
              name: { type: ["string", "null"] },
            },
            required: ["name"],
            additionalProperties: false,
          },
          assignedTo: {
            type: "object",
            properties: {
              displayName: { type: ["string", "null"] },
              roleName: { type: ["string", "null"] },
            },
            required: ["displayName", "roleName"],
            additionalProperties: false,
          },
        },
        required: ["id", "taskNumber", "status", "scheduledDueAt", "asset", "template", "assignedTo"],
        additionalProperties: false,
      },
      DashboardOverviewResponse: {
        type: "object",
        properties: {
          stats: { $ref: "#/components/schemas/DashboardOverviewStats" },
          complianceTrend: { type: "array", items: { $ref: "#/components/schemas/DashboardComplianceTrendRow" } },
          overdueByCategory: { type: "array", items: { $ref: "#/components/schemas/DashboardOverdueCategoryRow" } },
          overdueAssets: { type: "array", items: { $ref: "#/components/schemas/DashboardOverdueAssetRow" } },
          recentTasks: { type: "array", items: { $ref: "#/components/schemas/DashboardRecentTaskRow" } },
        },
        required: ["stats", "complianceTrend", "overdueByCategory", "overdueAssets", "recentTasks"],
        additionalProperties: false,
      },
      OverdueReportAsset: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          assetTag: { type: ["string", "null"] },
          name: { type: ["string", "null"] },
          location: { oneOf: [{ $ref: "#/components/schemas/EntityRef" }, { type: "null" }] },
          category: { oneOf: [{ $ref: "#/components/schemas/EntityRef" }, { type: "null" }] },
        },
        required: ["id", "assetTag", "name", "location", "category"],
        additionalProperties: false,
      },
      OverdueReportFacility: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          name: { type: ["string", "null"] },
          location: { oneOf: [{ $ref: "#/components/schemas/EntityRef" }, { type: "null" }] },
        },
        required: ["id", "name", "location"],
        additionalProperties: false,
      },
      OverdueReportItem: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          taskNumber: { type: "string" },
          scheduledDueAt: { type: "string", format: "date-time" },
          status: { type: "string" },
          priority: { type: ["string", "null"] },
          contextType: { type: "string", enum: ["asset", "facility"] },
          asset: { oneOf: [{ $ref: "#/components/schemas/OverdueReportAsset" }, { type: "null" }] },
          facility: { oneOf: [{ $ref: "#/components/schemas/OverdueReportFacility" }, { type: "null" }] },
          template: { $ref: "#/components/schemas/EntityRef" },
        },
        required: ["id", "taskNumber", "scheduledDueAt", "status", "priority", "contextType", "asset", "facility", "template"],
        additionalProperties: false,
      },
      OverdueReportResponse: {
        type: "object",
        properties: {
          page: { type: "integer" },
          pageSize: { type: "integer" },
          overdueCount: { type: "integer" },
          items: { type: "array", items: { $ref: "#/components/schemas/OverdueReportItem" } },
        },
        required: ["page", "pageSize", "overdueCount", "items"],
        additionalProperties: false,
      },
      ComplianceReportResponse: {
        type: "object",
        properties: {
          from: { type: "string", format: "date-time" },
          to: { type: "string", format: "date-time" },
          totalDue: { type: "integer" },
          completedOnTime: { type: "integer" },
          completedTotal: { type: "integer" },
          currentlyOverdue: { type: "integer" },
          complianceRate: { type: ["number", "null"] },
        },
        required: ["from", "to", "totalDue", "completedOnTime", "completedTotal", "currentlyOverdue", "complianceRate"],
        additionalProperties: false,
      },
      CmBreakdownRow: {
        type: "object",
        properties: {
          name: { type: "string" },
          count: { type: "integer" },
        },
        required: ["name", "count"],
        additionalProperties: false,
      },
      CmMttrRow: {
        type: "object",
        properties: {
          name: { type: "string" },
          seconds: { type: "number" },
        },
        required: ["name", "seconds"],
        additionalProperties: false,
      },
      CmMonthlyIncidentRow: {
        type: "object",
        properties: {
          monthStart: { type: "string", format: "date-time" },
          incidentCount: { type: "integer" },
        },
        required: ["monthStart", "incidentCount"],
        additionalProperties: false,
      },
      CmMetricsResponse: {
        type: "object",
        properties: {
          from: { type: "string", format: "date-time" },
          to: { type: "string", format: "date-time" },
          breakdownByCategory: { type: "array", items: { $ref: "#/components/schemas/CmBreakdownRow" } },
          breakdownByLocation: { type: "array", items: { $ref: "#/components/schemas/CmBreakdownRow" } },
          breakdownByFailureCategory: { type: "array", items: { $ref: "#/components/schemas/CmBreakdownRow" } },
          breakdownByImpactLevel: { type: "array", items: { $ref: "#/components/schemas/CmBreakdownRow" } },
          monthlyIncidents: { type: "array", items: { $ref: "#/components/schemas/CmMonthlyIncidentRow" } },
          mttrByCategory: { type: "array", items: { $ref: "#/components/schemas/CmMttrRow" } },
          mttrByLocation: { type: "array", items: { $ref: "#/components/schemas/CmMttrRow" } },
        },
        required: [
          "from",
          "to",
          "breakdownByCategory",
          "breakdownByLocation",
          "breakdownByFailureCategory",
          "breakdownByImpactLevel",
          "monthlyIncidents",
          "mttrByCategory",
          "mttrByLocation",
        ],
        additionalProperties: false,
      },
      SystemLogEntry: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          level: { type: "string" },
          message: { type: "string" },
          createdAt: { type: "string", format: "date-time" },
          context: { type: ["string", "null"] },
        },
        required: ["id", "level", "message", "createdAt", "context"],
        additionalProperties: false,
      },
      SystemLogsResponse: {
        type: "object",
        properties: {
          page: { type: "integer" },
          pageSize: { type: "integer" },
          items: { type: "array", items: { $ref: "#/components/schemas/SystemLogEntry" } },
        },
        required: ["page", "pageSize", "items"],
        additionalProperties: false,
      },
    },
  },
  security: [{ bearerAuth: [] }],
  tags: [
    { name: "Health" },
    { name: "Auth" },
    { name: "Dashboard" },
    { name: "Reports" },
    { name: "App Updates" },
    { name: "Assets" },
    { name: "Facilities" },
    { name: "Scheduling" },
    { name: "Tasks" },
    { name: "Work Orders" },
    { name: "Notifications" },
    { name: "System" },
  ],
  paths: {
    "/api/devices/push-test": {
      "post": {
        "tags": [
          "Devices"
        ],
        "summary": "Send a push test to current user devices",
        "description": "Every authenticated role. Targets active devices for the current user. Missing push configuration or tokens returns 400. Per-device delivery failures are reported in a 200 response with failed/failures; ok=true does not mean every delivery succeeded.",
        "parameters": [],
        "responses": {
          "200": {
            "description": "OK",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PushTestResponse"
                }
              }
            }
          },
          "400": {
            "description": "Invalid request, configuration, or provider failure",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "401": {
            "description": "Missing or invalid bearer token",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/PushTestRequest"
              }
            }
          }
        }
      },
    },
    "/api/system/evidence-import/run": {
      "post": {
        "tags": [
          "System"
        ],
        "summary": "Run evidence import",
        "description": "Admin or Superadmin. Requires configured import/storage roots. Imports files and may create/replace tasks unless dryRun=true. duplicateAction defaults to skip. Schema and storage acceptance remain separate.",
        "parameters": [],
        "responses": {
          "200": {
            "description": "OK",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/EvidenceImportResponse"
                }
              }
            }
          },
          "400": {
            "description": "Invalid request, configuration, or provider failure",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "401": {
            "description": "Missing or invalid bearer token",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "403": {
            "description": "Forbidden",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/EvidenceImportRunRequest"
              }
            }
          }
        }
      },
    },
    "/api/system/jobs/{jobName}/run": {
      "post": {
        "tags": [
          "System"
        ],
        "summary": "Run a background job now",
        "description": "Admin or Superadmin. Runs the selected job; snipe-sync requires configuration and uses force mode. Returns 409 when the process already considers that job running. No distributed execution guarantee is implied.",
        "parameters": [
          {
            "name": "jobName",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string",
              "enum": [
                "snipe-sync",
                "schedule-calc",
                "notifications"
              ]
            }
          }
        ],
        "responses": {
          "200": {
            "description": "OK",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/OkResponse"
                }
              }
            }
          },
          "400": {
            "description": "Invalid request, configuration, or provider failure",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "401": {
            "description": "Missing or invalid bearer token",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "403": {
            "description": "Forbidden",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "404": {
            "description": "Not found",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "409": {
            "description": "Job already running",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        }
      },
    },
    "/api/system/ldap/search": {
      "get": {
        "tags": [
          "System"
        ],
        "summary": "Search LDAP profiles",
        "description": "Admin or Superadmin. query takes precedence over q. Blank search returns an empty list without provider lookup. Default limit is 10.",
        "parameters": [
          {
            "name": "q",
            "in": "query",
            "schema": {
              "type": "string",
              "maxLength": 256
            }
          },
          {
            "name": "query",
            "in": "query",
            "schema": {
              "type": "string",
              "maxLength": 256
            }
          },
          {
            "name": "limit",
            "in": "query",
            "schema": {
              "type": "integer",
              "minimum": 1,
              "maximum": 50,
              "default": 10
            }
          }
        ],
        "responses": {
          "503": {
            description: "LDAP is not configured. Local login remains available; omitted login provider still defaults to LDAP.",
            content: { "application/json": { schema: { type: "object", required: ["message", "code"], properties: { message: { type: "string" }, code: { type: "string", enum: ["LDAP_NOT_CONFIGURED"] } } } } },
          },
          "200": {
            "description": "OK",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/LdapSearchResponse"
                }
              }
            }
          },
          "400": {
            "description": "Invalid request, configuration, or provider failure",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "401": {
            "description": "Missing or invalid bearer token",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "403": {
            "description": "Forbidden",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "Operation failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        }
      },
    },
    "/api/system/users/assign-ldap": {
      "post": {
        "tags": [
          "System"
        ],
        "summary": "Assign a single role to an LDAP user",
        "description": "Admin or Superadmin. Looks up and upserts the LDAP profile, applies active status, and reconciles to the supplied single role. Lookup/assignment failure returns 400.",
        "parameters": [],
        "responses": {
          "503": {
            description: "LDAP is not configured. Local login remains available; omitted login provider still defaults to LDAP.",
            content: { "application/json": { schema: { type: "object", required: ["message", "code"], properties: { message: { type: "string" }, code: { type: "string", enum: ["LDAP_NOT_CONFIGURED"] } } } } },
          },
          "200": {
            "description": "OK",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/IdResponse"
                }
              }
            }
          },
          "400": {
            "description": "Invalid request, configuration, or provider failure",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "401": {
            "description": "Missing or invalid bearer token",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "403": {
            "description": "Forbidden",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/AssignLdapUserRequest"
              }
            }
          }
        }
      },
    },
    "/api/system/users/local": {
      "post": {
        "tags": [
          "System"
        ],
        "summary": "Create or replace a local user account",
        "description": "Admin or Superadmin. Upserts by username, sets local provider and credentials, replaces the password and role membership with the submitted role. Creates the named role when absent. Existing usernames are updated, not rejected as duplicates; success is 200.",
        "parameters": [],
        "responses": {
          "200": {
            "description": "OK",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/IdResponse"
                }
              }
            }
          },
          "400": {
            "description": "Invalid request, configuration, or provider failure",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "401": {
            "description": "Missing or invalid bearer token",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "403": {
            "description": "Forbidden",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "Operation failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/CreateLocalUserRequest"
              }
            }
          }
        }
      },
    },
    "/api/system/users/{userId}/refresh-ldap": {
      "post": {
        "tags": [
          "System"
        ],
        "summary": "Refresh an LDAP user profile",
        "description": "Admin or Superadmin. Only existing LDAP users; provider failure returns 400. Updates profile fields from LDAP.",
        "parameters": [
          {
            "name": "userId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string",
              "format": "uuid"
            }
          }
        ],
        "responses": {
          "503": {
            description: "LDAP is not configured. Local login remains available; omitted login provider still defaults to LDAP.",
            content: { "application/json": { schema: { type: "object", required: ["message", "code"], properties: { message: { type: "string" }, code: { type: "string", enum: ["LDAP_NOT_CONFIGURED"] } } } } },
          },
          "200": {
            "description": "OK",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/OkResponse"
                }
              }
            }
          },
          "400": {
            "description": "Invalid request, configuration, or provider failure",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "401": {
            "description": "Missing or invalid bearer token",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "403": {
            "description": "Forbidden",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "404": {
            "description": "Not found",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        }
      },
    },
    "/api/system/users/for-assignment": {
      "get": {
        "tags": [
          "System"
        ],
        "summary": "List users available for assignment",
        "description": "Supervisor, Admin, or Superadmin. Defaults to active users. tasksCompleted is always zero in this response.",
        "parameters": [
          {
            "name": "page",
            "in": "query",
            "schema": {
              "type": "string"
            },
            "description": "Defaults to 1; minimum 1."
          },
          {
            "name": "pageSize",
            "in": "query",
            "schema": {
              "type": "string"
            },
            "description": "Defaults to 50; clamped to 1-200."
          },
          {
            "name": "search",
            "in": "query",
            "schema": {
              "type": "string"
            },
            "description": "Matches username, display name, or email."
          },
          {
            "name": "isActive",
            "in": "query",
            "schema": {
              "type": "string",
              "enum": [
                "true",
                "false"
              ],
              "default": "true"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "OK",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/AssignableUsersResponse"
                }
              }
            }
          },
          "400": {
            "description": "Invalid request, configuration, or provider failure",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "401": {
            "description": "Missing or invalid bearer token",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "403": {
            "description": "Forbidden",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        }
      },
    },
    "/api/system/whatsapp-settings/test": {
      "post": {
        "tags": [
          "System"
        ],
        "summary": "Validate WhatsApp configuration or send test message",
        "description": "Admin or Superadmin. Without sendTestMessage=true only requires a configured base URL; does not contact the provider. With the flag enabled, sends to the effective configured number/group. Does not save overrides.",
        "parameters": [],
        "responses": {
          "200": {
            "description": "OK",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/WhatsAppTestResponse"
                }
              }
            }
          },
          "400": {
            "description": "Invalid request, configuration, or provider failure",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "401": {
            "description": "Missing or invalid bearer token",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "403": {
            "description": "Forbidden",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/WhatsAppSettingsTestRequest"
              }
            }
          }
        }
      },
    },
    "/api/system/microsoft-graph-settings/test": {
      "post": {
        "tags": [
          "System"
        ],
        "summary": "Test and store Microsoft Graph configuration",
        "description": "Admin or Superadmin. Acquires a client-credentials token. Optionally sends email to configured recipients when sendTestEmail=true. On success persists the effective configuration and test timestamp, including supplied overrides. This is not a read-only connection check.",
        "parameters": [],
        "responses": {
          "200": {
            "description": "OK",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/MicrosoftGraphTestResponse"
                }
              }
            }
          },
          "400": {
            "description": "Invalid request, configuration, or provider failure",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "401": {
            "description": "Missing or invalid bearer token",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "403": {
            "description": "Forbidden",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "Operation failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "503": {
            "description": "Required database schema is missing",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/MicrosoftGraphSettingsTestRequest"
              }
            }
          }
        }
      },
    },
    "/api/system/snipeit-settings/test": {
      "post": {
        "tags": [
          "System"
        ],
        "summary": "Test Snipe-IT connection",
        "description": "Admin or Superadmin. Uses optional overrides and requests one hardware record from the upstream API; does not run synchronization.",
        "parameters": [],
        "responses": {
          "200": {
            "description": "OK",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/OkResponse"
                }
              }
            }
          },
          "400": {
            "description": "Invalid request, configuration, or provider failure",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "401": {
            "description": "Missing or invalid bearer token",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "403": {
            "description": "Forbidden",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/SnipeItSettingsTestRequest"
              }
            }
          }
        }
      },
    },
    "/api/system/ui-settings/label-designer": {
      "get": {
        "tags": [
          "System"
        ],
        "summary": "Get label-designer UI settings",
        "description": "Every authenticated role. Falls back to default settings when no usable stored configuration exists.",
        "parameters": [],
        "responses": {
          "200": {
            "description": "OK",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/LabelDesignerUiSettingsResponse"
                }
              }
            }
          },
          "401": {
            "description": "Missing or invalid bearer token",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "Operation failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        }
      },
      "put": {
        "tags": [
          "System"
        ],
        "summary": "Store label-designer UI settings",
        "description": "Admin or Superadmin. Requires the complete label configuration.",
        "parameters": [],
        "responses": {
          "200": {
            "description": "OK",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/LabelDesignerUiSettingsResponse"
                }
              }
            }
          },
          "400": {
            "description": "Invalid request, configuration, or provider failure",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "401": {
            "description": "Missing or invalid bearer token",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "403": {
            "description": "Forbidden",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "Operation failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "503": {
            "description": "Required database schema is missing",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/LabelDesignerUiSettingsRequest"
              }
            }
          }
        }
      },
    },
    "/api/system/ui-settings/assets": {
      "get": {
        "tags": [
          "System"
        ],
        "summary": "Get assets UI settings",
        "description": "Every authenticated role. Falls back to default settings when no usable stored configuration exists.",
        "parameters": [],
        "responses": {
          "200": {
            "description": "OK",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/AssetsUiSettingsResponse"
                }
              }
            }
          },
          "401": {
            "description": "Missing or invalid bearer token",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "Operation failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        }
      },
      "put": {
        "tags": [
          "System"
        ],
        "summary": "Store assets UI settings",
        "description": "Superadmin only. Omitted excludeInactive becomes false.",
        "parameters": [],
        "responses": {
          "200": {
            "description": "OK",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/AssetsUiSettingsResponse"
                }
              }
            }
          },
          "400": {
            "description": "Invalid request, configuration, or provider failure",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "401": {
            "description": "Missing or invalid bearer token",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "403": {
            "description": "Forbidden",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "Operation failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "503": {
            "description": "Required database schema is missing",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/AssetsUiSettingsRequest"
              }
            }
          }
        }
      },
    },
    "/api/system/whatsapp-settings": {
      "get": {
        "tags": [
          "System"
        ],
        "summary": "Get WhatsApp configuration",
        "description": "Every authenticated role. Returns effective configuration; token/client-secret values are not returned.",
        "parameters": [],
        "responses": {
          "200": {
            "description": "OK",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/WhatsAppSettingsResponse"
                }
              }
            }
          },
          "401": {
            "description": "Missing or invalid bearer token",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        }
      },
      "put": {
        "tags": [
          "System"
        ],
        "summary": "Store WhatsApp configuration",
        "description": "Admin or Superadmin. Stores settings and returns effective configuration. Omitted secret retains its current value; other fields follow the request schema. Nullable fields may fall back to environment values when effective configuration is loaded.",
        "parameters": [],
        "responses": {
          "200": {
            "description": "OK",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/WhatsAppSettingsResponse"
                }
              }
            }
          },
          "400": {
            "description": "Invalid request, configuration, or provider failure",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "401": {
            "description": "Missing or invalid bearer token",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "403": {
            "description": "Forbidden",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "Operation failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "503": {
            "description": "Required database schema is missing",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/WhatsAppSettingsRequest"
              }
            }
          }
        }
      },
    },
    "/api/system/microsoft-graph-settings": {
      "get": {
        "tags": [
          "System"
        ],
        "summary": "Get MicrosoftGraph configuration",
        "description": "Every authenticated role. Returns effective configuration; token/client-secret values are not returned.",
        "parameters": [],
        "responses": {
          "200": {
            "description": "OK",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/MicrosoftGraphSettingsResponse"
                }
              }
            }
          },
          "401": {
            "description": "Missing or invalid bearer token",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        }
      },
      "put": {
        "tags": [
          "System"
        ],
        "summary": "Store MicrosoftGraph configuration",
        "description": "Admin or Superadmin. Stores settings and returns effective configuration. Omitted secret retains its current value; other fields follow the request schema. Nullable fields may fall back to environment values when effective configuration is loaded.",
        "parameters": [],
        "responses": {
          "200": {
            "description": "OK",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/MicrosoftGraphSettingsResponse"
                }
              }
            }
          },
          "400": {
            "description": "Invalid request, configuration, or provider failure",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "401": {
            "description": "Missing or invalid bearer token",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "403": {
            "description": "Forbidden",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "Operation failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "503": {
            "description": "Required database schema is missing",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/MicrosoftGraphSettingsUpdateRequest"
              }
            }
          }
        }
      },
    },
    "/api/system/snipeit-settings": {
      "get": {
        "tags": [
          "System"
        ],
        "summary": "Get SnipeIt configuration",
        "description": "Every authenticated role. Returns effective configuration; token/client-secret values are not returned.",
        "parameters": [],
        "responses": {
          "200": {
            "description": "OK",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/SnipeItSettingsResponse"
                }
              }
            }
          },
          "401": {
            "description": "Missing or invalid bearer token",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        }
      },
      "put": {
        "tags": [
          "System"
        ],
        "summary": "Store SnipeIt configuration",
        "description": "Admin or Superadmin. Stores settings and returns effective configuration. Omitted secret retains its current value; other fields follow the request schema. Nullable fields may fall back to environment values when effective configuration is loaded.",
        "parameters": [],
        "responses": {
          "200": {
            "description": "OK",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/SnipeItSettingsResponse"
                }
              }
            }
          },
          "400": {
            "description": "Invalid request, configuration, or provider failure",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "401": {
            "description": "Missing or invalid bearer token",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "403": {
            "description": "Forbidden",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "Operation failed",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "503": {
            "description": "Required database schema is missing",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/SnipeItSettingsUpdateRequest"
              }
            }
          }
        }
      },
    },
    "/api/system/status": {
      "get": {
        "tags": [
          "System"
        ],
        "summary": "Get system and integration status",
        "description": "Every authenticated role. Reports configuration and database probe state, not proof of external service delivery.",
        "parameters": [],
        "responses": {
          "200": {
            "description": "OK",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/SystemStatusResponse"
                }
              }
            }
          },
          "401": {
            "description": "Missing or invalid bearer token",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        }
      },
    },
    "/api/tasks/{taskId}/checklist-items/{templateChecklistItemId}/evidence/upload": {
      "post": {
        "tags": [
          "Tasks"
        ],
        "summary": "Upload checklist evidence",
        "description": "Send raw non-empty file bytes, not multipart. Requires assignment-based modification access or manager rights. Approval-locked work rejects non-Superadmin with 400. Requires configured evidence storage. Maximum raw-body size is 50 MiB; parser-level errors may be HTML rather than JSON.",
        "parameters": [
          {
            "name": "taskId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string",
              "format": "uuid"
            }
          },
          {
            "name": "templateChecklistItemId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string",
              "format": "uuid"
            }
          },
          {
            "name": "x-filename",
            "in": "header",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "Original file name; basename is sanitized before storage."
          }
        ],
        "responses": {
          "201": {
            "description": "OK",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/IdResponse"
                }
              }
            }
          },
          "400": {
            "description": "Invalid request or state",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "401": {
            "description": "Missing or invalid bearer token",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "403": {
            "description": "Forbidden",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "404": {
            "description": "Not found",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "413": {
            "description": "Body exceeds the 50 MiB limit. May be an Express HTML parser error or a JSON message.",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              },
              "text/html": {
                "schema": {
                  "type": "string"
                }
              }
            }
          },
          "500": {
            "description": "Evidence storage is not configured or evidence insertion failed; unexpected filesystem/database errors are not normalized by this contract.",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "409": {"description": "Task became completed or cancelled before the evidence was attached", "content": {"application/json": {"schema": {"$ref": "#/components/schemas/ErrorResponse"}}}}
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/octet-stream": {
              "schema": {
                "type": "string",
                "format": "binary"
              }
            },
            "image/*": {
              "schema": {
                "type": "string",
                "format": "binary"
              }
            }
          },
          "description": "Raw file content with its content type; JSON bodies are consumed by the global JSON parser and are not accepted as a file buffer."
        }
      },
    },
    "/api/tasks/{taskId}/evidence/upload": {
      "post": {
        "tags": [
          "Tasks"
        ],
        "summary": "Upload task evidence",
        "description": "Send raw non-empty file bytes, not multipart. Requires assignment-based modification access or manager rights. Approval-locked work rejects non-Superadmin with 400. Requires configured evidence storage. Maximum raw-body size is 50 MiB; parser-level errors may be HTML rather than JSON.",
        "parameters": [
          {
            "name": "taskId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string",
              "format": "uuid"
            }
          },
          {
            "name": "x-filename",
            "in": "header",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "Original file name; basename is sanitized before storage."
          }
        ],
        "responses": {
          "201": {
            "description": "OK",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/IdResponse"
                }
              }
            }
          },
          "400": {
            "description": "Invalid request or state",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "401": {
            "description": "Missing or invalid bearer token",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "403": {
            "description": "Forbidden",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "404": {
            "description": "Not found",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "413": {
            "description": "Body exceeds the 50 MiB limit. May be an Express HTML parser error or a JSON message.",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              },
              "text/html": {
                "schema": {
                  "type": "string"
                }
              }
            }
          },
          "500": {
            "description": "Evidence storage is not configured or evidence insertion failed; unexpected filesystem/database errors are not normalized by this contract.",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "409": {"description": "Task became completed or cancelled before the evidence was attached", "content": {"application/json": {"schema": {"$ref": "#/components/schemas/ErrorResponse"}}}}
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/octet-stream": {
              "schema": {
                "type": "string",
                "format": "binary"
              }
            },
            "image/*": {
              "schema": {
                "type": "string",
                "format": "binary"
              }
            }
          },
          "description": "Raw file content with its content type; JSON bodies are consumed by the global JSON parser and are not accepted as a file buffer."
        }
      },
    },
    "/api/work-orders/{taskId}/resolution": {
      "post": {
        "tags": [
          "Work orders"
        ],
        "summary": "Update corrective work-order resolution notes",
        "description": "Requires assignment-based modification access or manager rights. Empty or omitted notes clears ResolutionNotes; maximum length 2048. This operation does not close the work order.",
        "parameters": [
          {
            "name": "taskId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string",
              "format": "uuid"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "OK",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/OkResponse"
                }
              }
            }
          },
          "400": {
            "description": "Invalid request or state",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "401": {
            "description": "Missing or invalid bearer token",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "403": {
            "description": "Forbidden",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "404": {
            "description": "Not found",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/WorkOrderResolutionRequest"
              }
            }
          }
        }
      },
    },
    "/api/tasks/bulk-assign-unassigned": {
      "post": {
        "tags": [
          "Tasks"
        ],
        "summary": "Assign work with no user or role assignment",
        "description": "Supervisor, Admin, or Superadmin. Exactly one user or role target is required. Includes unfinished and uncancelled tasks of either maintenance type, excludes approval-locked PM tasks, and applies inclusive due bounds. Returns zero when nothing matches.",
        "parameters": [],
        "responses": {
          "200": {
            "description": "OK",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/BulkAssignUnassignedResponse"
                }
              }
            }
          },
          "400": {
            "description": "Invalid request or state",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "401": {
            "description": "Missing or invalid bearer token",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "403": {
            "description": "Forbidden",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/BulkAssignUnassignedRequest"
              }
            }
          }
        }
      },
    },
    "/api/auth/me/preferences": {
      "get": {
        "tags": [
          "Auth"
        ],
        "summary": "Get current user preferences",
        "description": "Authenticated user only. Missing values or missing user row return null preferences.",
        "parameters": [],
        "responses": {
          "200": {
            "description": "OK",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/UserPreferences"
                }
              }
            }
          },
          "401": {
            "description": "Missing or invalid bearer token",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        }
      },
      "put": {
        "tags": [
          "Auth"
        ],
        "summary": "Replace current user preferences",
        "description": "Authenticated user only. Both preference columns are written: omitted fields become null; an empty object clears both preferences.",
        "parameters": [],
        "responses": {
          "200": {
            "description": "OK",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/OkResponse"
                }
              }
            }
          },
          "400": {
            "description": "Invalid request or state",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "401": {
            "description": "Missing or invalid bearer token",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/UserPreferencesRequest"
              }
            }
          }
        }
      },
    },
    "/api/templates/{templateId}": {
      "get": {
        "tags": [
          "Templates"
        ],
        "summary": "Get template and ordered checklist",
        "description": "Available to every authenticated role. Includes inactive checklist items ordered by sortOrder.",
        "parameters": [
          {
            "name": "templateId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string",
              "format": "uuid"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "OK",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/TemplateDetail"
                }
              }
            }
          },
          "400": {
            "description": "Invalid request or state",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "401": {
            "description": "Missing or invalid bearer token",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "404": {
            "description": "Not found",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        }
      },
      "put": {
        "tags": [
          "Templates"
        ],
        "summary": "Update maintenance template",
        "description": "Supervisor, Admin, or Superadmin. Partial template update increments version. Supplied checklistItems deactivates omitted existing IDs. Duplicate name returns 409.",
        "parameters": [
          {
            "name": "templateId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string",
              "format": "uuid"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "OK",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/OkResponse"
                }
              }
            }
          },
          "400": {
            "description": "Invalid request or state",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "401": {
            "description": "Missing or invalid bearer token",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "403": {
            "description": "Forbidden",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "404": {
            "description": "Not found",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "409": {
            "description": "Conflict",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/TemplateUpdateRequest"
              }
            }
          }
        }
      },
      "delete": {
        "tags": [
          "Templates"
        ],
        "summary": "Delete unused maintenance template",
        "description": "Supervisor, Admin, or Superadmin. Permanently removes checklist and template in one transaction. Returns 409 when referenced by enabled asset/facility PM settings, schedules, or tasks.",
        "parameters": [
          {
            "name": "templateId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string",
              "format": "uuid"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "OK",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/OkResponse"
                }
              }
            }
          },
          "400": {
            "description": "Invalid request or state",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "401": {
            "description": "Missing or invalid bearer token",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "403": {
            "description": "Forbidden",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "404": {
            "description": "Not found",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "409": {
            "description": "Conflict",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        }
      },
    },
    "/api/templates": {
      "get": {
        "tags": [
          "Templates"
        ],
        "summary": "List maintenance templates",
        "description": "Available to every authenticated role. Returns all templates unless active is exactly the string true. Sorted by UpdatedAt descending.",
        "parameters": [
          {
            "name": "active",
            "in": "query",
            "schema": {
              "type": "string"
            },
            "description": "Only true filters to active templates; other values return all."
          }
        ],
        "responses": {
          "200": {
            "description": "OK",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/TemplateListResponse"
                }
              }
            }
          },
          "401": {
            "description": "Missing or invalid bearer token",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        }
      },
      "post": {
        "tags": [
          "Templates"
        ],
        "summary": "Create maintenance template",
        "description": "Supervisor, Admin, or Superadmin. Creates template and checklist transactionally; duplicate template name returns 409.",
        "parameters": [],
        "responses": {
          "201": {
            "description": "OK",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/IdResponse"
                }
              }
            }
          },
          "400": {
            "description": "Invalid request or state",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "401": {
            "description": "Missing or invalid bearer token",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "403": {
            "description": "Forbidden",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "409": {
            "description": "Conflict",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/TemplateCreateRequest"
              }
            }
          }
        }
      },
    },
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
          "503": {
            description: "LDAP is not configured. Local login remains available; omitted login provider still defaults to LDAP.",
            content: { "application/json": { schema: { type: "object", required: ["message", "code"], properties: { message: { type: "string" }, code: { type: "string", enum: ["LDAP_NOT_CONFIGURED"] } } } } },
          },
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
    "/api/devices/push-broadcast": {
      post: {
        tags: ["Notifications"],
        summary: "Send push broadcast",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/PushBroadcastRequest" },
            },
          },
        },
        responses: {
          "200": {
            description: "OK",
            content: { "application/json": { schema: { $ref: "#/components/schemas/PushBroadcastResponse" } } },
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
        description: "Create a facility. Only Admin and Superadmin may change facility master data; Supervisor retains PM planning rights but cannot create, edit, archive or clone facilities.",
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
    "/api/facilities/{facilityId}": {
      "get": {
        "tags": [
          "Facilities"
        ],
        "summary": "Get facility details",
        "description": "Available to every authenticated role. Missing location is null, unlike the nullable-id object in facility list responses.",
        "parameters": [
          {
            "name": "facilityId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string",
              "format": "uuid"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "OK",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/FacilityDetail"
                }
              }
            }
          },
          "400": {
            "description": "Invalid request or state",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "401": {
            "description": "Missing or invalid bearer token",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "404": {
            "description": "Not found",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        }
      },

  "put": {
    "tags": [
      "Facilities"
    ],
    "summary": "Update facility master data",
    "description": "Admin/Superadmin only. Set isActive=false to archive or true to activate. At least one recognized field is required; unspecified fields are preserved. PM settings are a separate planning operation. Unknown fields are stripped. Enabled PM requires a site and an active default template; asset templates must match the category. Invalid effective settings return HTTP 400 with code PM_ACTIVATION_INVALID and details containing contextId and field. The transaction rolls back on failure. Archiving cancels only unstarted open PM tasks in the same transaction; existing started work and CM are retained.",
    "parameters": [
      {
        "name": "facilityId",
        "in": "path",
        "required": true,
        "schema": {
          "type": "string",
          "format": "uuid"
        }
      }
    ],
    "requestBody": {
      "required": true,
      "content": {
        "application/json": {
          "schema": {
            "type": "object",
            "minProperties": 1,
            "properties": {
              "name": {
                "type": "string",
                "minLength": 1,
                "maxLength": 256
              },
              "locationId": {
                "type": [
                  "string",
                  "null"
                ],
                "format": "uuid"
              },
              "description": {
                "type": [
                  "string",
                  "null"
                ],
                "maxLength": 1024
              },
              "isActive": {
                "type": "boolean"
              }
            }
          }
        }
      }
    },
    "responses": {
      "200": {
        "description": "Updated",
        "content": {
          "application/json": {
            "schema": {
              "type": "object",
              "properties": {
                "ok": {
                  "type": "boolean",
                  "enum": [
                    true
                  ]
                }
              },
              "required": [
                "ok"
              ]
            }
          }
        }
      },
      "400": {
        "description": "Invalid facility ID or request body",
        "content": {
          "application/json": {
            "schema": {
              "$ref": "#/components/schemas/ErrorResponse"
            }
          }
        }
      },
      "401": {
        "description": "Unauthorized",
        "content": {
          "application/json": {
            "schema": {
              "$ref": "#/components/schemas/ErrorResponse"
            }
          }
        }
      },
      "403": {
        "description": "Requires Admin or Superadmin",
        "content": {
          "application/json": {
            "schema": {
              "$ref": "#/components/schemas/ErrorResponse"
            }
          }
        }
      },
      "404": {
        "description": "Facility not found",
        "content": {
          "application/json": {
            "schema": {
              "$ref": "#/components/schemas/ErrorResponse"
            }
          }
        }
      }
    }
  }
},
    "/api/facilities/{facilityId}/pm-settings": {
      put: {
        tags: ["Facilities"],
        summary: "Update facility PM settings",
        description: "Supervisor, Admin, or Superadmin may update supplied PM fields. Omitted fields retain their existing values. Supplying defaultTemplateId (including null) without nextPmDueAt resets planned/effective due dates for recalculation. Explicit nextPmDueAt=null clears both dates; a timestamp sets the planned date and its blackout-adjusted effective date. Disabling PM cancels only unstarted open PM tasks, retaining history and audit records. Enabled PM requires a site and an active default template; asset templates must match the category. Invalid effective settings return HTTP 400 with code PM_ACTIVATION_INVALID and details containing contextId and field. The transaction rolls back on failure.",
        parameters: [
          { name: "facilityId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
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
        },
      },
    },
    "/api/facilities/{facilityId}/pm-now": {
      post: {
        tags: ["Facilities"],
        summary: "Create or reuse the current PM occurrence for a facility",
        parameters: [
          { name: "facilityId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        responses: {
          "200": {
            description: "Reused an existing due, overdue, or upcoming regular PM task",
            content: { "application/json": { schema: { $ref: "#/components/schemas/IdResponse" } } },
          },
          "201": {
            description: "Created a PM task representing the current regular occurrence",
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
    "/api/facilities/{facilityId}/skip-next-pm": {
      post: {
        tags: ["Facilities"],
        summary: "Skip the next planned facility PM occurrence",
        parameters: [
          { name: "facilityId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/SkipNextPmRequest" } },
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
          "409": {
            description: "The requested occurrence changed or is protected by active or approval-stage work",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
        },
      },
    },
    "/api/facilities/{facilityId}/clone": {
  "post": {
    "tags": [
      "Facilities"
    ],
    "summary": "Clone facility",
    "description": "Admin/Superadmin only, including when copying PM settings. Copies facility details and active state; blank or omitted name generates a copy name. Optional PM settings copy preserves enabled/default template and resets last/next PM dates. Source is retained. Unknown fields are stripped. Enabled PM requires a site and an active default template; asset templates must match the category. Invalid effective settings return HTTP 400 with code PM_ACTIVATION_INVALID and details containing contextId and field. The transaction rolls back on failure. Copying invalid enabled settings rolls back the new facility.",
    "parameters": [
      {
        "name": "facilityId",
        "in": "path",
        "required": true,
        "schema": {
          "type": "string",
          "format": "uuid"
        }
      }
    ],
    "requestBody": {
      "required": false,
      "content": {
        "application/json": {
          "schema": {
            "type": "object",
            "properties": {
              "name": {
                "type": "string",
                "maxLength": 256
              },
              "includePmSettings": {
                "type": "boolean",
                "default": true
              }
            }
          }
        }
      }
    },
    "responses": {
      "201": {
        "description": "Created",
        "content": {
          "application/json": {
            "schema": {
              "$ref": "#/components/schemas/IdResponse"
            }
          }
        }
      },
      "400": {
        "description": "Invalid facility ID or request body",
        "content": {
          "application/json": {
            "schema": {
              "$ref": "#/components/schemas/ErrorResponse"
            }
          }
        }
      },
      "401": {
        "description": "Unauthorized",
        "content": {
          "application/json": {
            "schema": {
              "$ref": "#/components/schemas/ErrorResponse"
            }
          }
        }
      },
      "403": {
        "description": "Requires Admin or Superadmin",
        "content": {
          "application/json": {
            "schema": {
              "$ref": "#/components/schemas/ErrorResponse"
            }
          }
        }
      },
      "404": {
        "description": "Facility not found",
        "content": {
          "application/json": {
            "schema": {
              "$ref": "#/components/schemas/ErrorResponse"
            }
          }
        }
      },
      "500": {
        "description": "Failed to create facility",
        "content": {
          "application/json": {
            "schema": {
              "$ref": "#/components/schemas/ErrorResponse"
            }
          }
        }
      }
    }
  }
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
        description: "Manual nextPmDueAt sets the planned anchor for the next regular occurrence; the stored effective due date applies existing blackout shifting. Enabled PM requires a site and an active default template; asset templates must match the category. Invalid effective settings return HTTP 400 with code PM_ACTIVATION_INVALID and details containing contextId and field. The transaction rolls back on failure. Disabling PM atomically cancels only unstarted open PM tasks.",
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
    "/api/assets/{assetId}/skip-next-pm": {
      post: {
        tags: ["Assets"],
        summary: "Skip the next planned asset PM occurrence",
        parameters: [
          { name: "assetId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/SkipNextPmRequest" } },
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
          "409": {
            description: "The requested occurrence changed or is protected by active or approval-stage work",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
        },
      },
    },
    "/api/assets/pm/bulk": {
      post: {
        tags: ["Assets"],
        summary: "Bulk set PM enabled",
        description: "Enabled PM requires a site and an active default template; asset templates must match the category. Invalid effective settings return HTTP 400 with code PM_ACTIVATION_INVALID and details containing contextId and field. The transaction rolls back on failure. The entire batch is atomic; disabling cancels only unstarted open PM tasks for every selected asset.",
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
        description: "Enabled PM requires a site and an active default template; asset templates must match the category. Invalid effective settings return HTTP 400 with code PM_ACTIVATION_INVALID and details containing contextId and field. The transaction rolls back on failure. The entire batch is atomic.",
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
        description: "Server-side view/uiStatus and search filter before pagination. total is the selected view total; tabCounts covers the complete shared-filter scope independently of view/page. Day boundaries are paired ISO timestamps (23–25 hours), start inclusive/end exclusive; default UTC. Scheduling views exclude submitted/finalized/closed work; pending views use approval stage even for historical completed lifecycle rows. Overdue uses request time and can overlap Due Today; Upcoming begins at todayEnd. Checklist totals/counts prefer the frozen submitted checklist definition when a PM task snapshot exists; otherwise they use the current live template.",
        parameters: [
          { name: "view", in: "query", schema: { type: "string", enum: ["all", "due_today", "overdue", "in_progress", "upcoming", "paused", "completed", "cancelled", "pending_supervisor", "pending_superadmin"], default: "all" } },
          { name: "uiStatus", in: "query", schema: { type: "string", enum: ["all", "due_today", "overdue", "in_progress", "upcoming", "paused", "completed", "cancelled", "pending_supervisor", "pending_superadmin"], default: "all" } },
          { name: "q", in: "query", description: "Literal substring of task number, asset tag/name, facility or site; maximum 200 characters", schema: { type: "string", maxLength: 200 } },
          { name: "approvedOnly", in: "query", schema: { type: "string", enum: ["true", "false"] } },
          { name: "todayStart", in: "query", schema: { type: "string", format: "date-time" } },
          { name: "todayEnd", in: "query", schema: { type: "string", format: "date-time" } },
          { name: "facilityId", in: "query", schema: { type: "string", format: "uuid" } },

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
            content: { "application/json": { schema: { allOf: [{ $ref: "#/components/schemas/PaginatedList" }, { type: "object", required: ["total", "tabCounts"], properties: { total: { type: "integer", minimum: 0 }, tabCounts: { type: "object", required: ["all", "due_today", "overdue", "in_progress", "upcoming", "paused", "completed", "cancelled", "pending_supervisor", "pending_superadmin"], properties: {"all": {"type": "integer", "minimum": 0}, "due_today": {"type": "integer", "minimum": 0}, "overdue": {"type": "integer", "minimum": 0}, "in_progress": {"type": "integer", "minimum": 0}, "upcoming": {"type": "integer", "minimum": 0}, "paused": {"type": "integer", "minimum": 0}, "completed": {"type": "integer", "minimum": 0}, "cancelled": {"type": "integer", "minimum": 0}, "pending_supervisor": {"type": "integer", "minimum": 0}, "pending_superadmin": {"type": "integer", "minimum": 0}} }, items: { type: "array", items: { type: "object", properties: { maintenanceType: { type: "string", enum: ["PM", "CM"] }, displayStatus: { type: "string", enum: ["all", "due_today", "overdue", "in_progress", "upcoming", "paused", "completed", "cancelled", "pending_supervisor", "pending_superadmin"] } } } } } }] } } },
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
    "/api/tasks/{taskId}": {
      "delete": {
        "tags": [
          "Tasks"
        ],
        "summary": "Delete a PM task",
        "description": "Supervisor, Admin, or Superadmin, subject to task access. PM only; CM or missing IDs return 404. Deletes task-owned checklist results/snapshots, evidence, drafts, work sessions and CM event/interval rows atomically with the task and audit entry. Scheduling history, notification logs or other task references block deletion with 409 TASK_REFERENCED. Evidence files are removed best-effort only after commit; storage failure does not roll back committed data.",
        "parameters": [
          {
            "name": "taskId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string",
              "format": "uuid"
            }
          }
        ],
        "responses": {
          "409": {
            "description": "TASK_REFERENCED: independent history or another task references this task; no deletion is performed",
            "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorResponse" } } }
          },
          "200": {
            "description": "OK",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/OkResponse"
                }
              }
            }
          },
          "400": {
            "description": "Invalid request or state",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "401": {
            "description": "Missing or invalid bearer token",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "403": {
            "description": "Forbidden",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "404": {
            "description": "Not found",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        }
      },

      get: {
        tags: ["Tasks"],
        summary: "Get task detail",
        parameters: [
          { name: "taskId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/TaskDetailResponse" },
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
          "409": {
            description: "Broken assets cannot receive new PM work",
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
        description:
          "Managers can assign or reassign tasks. Submitted PM tasks are locked until they are returned for revision, and this request does not change lifecycle status.",
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
          "409": {
            description: "Submitted PM tasks cannot be reassigned until they are returned for revision",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
        },
      },
    },
    "/api/tasks/{taskId}/claim": {
      post: {
        tags: ["Tasks"],
        summary: "Claim a role-queued PM task",
        description:
          "An eligible technician exclusively claims a PM task that is still assigned to a role queue. Repeat claims by the current owner return claimed=false.",
        parameters: [
          { name: "taskId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        responses: {
          "200": {
            description: "OK",
            content: { "application/json": { schema: { $ref: "#/components/schemas/TaskClaimResponse" } } },
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
          "409": {
            description: "Task is no longer claimable, was already claimed, or is locked after submission",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
        },
      },
    },
    "/api/tasks/{taskId}/start": {
      post: {
        tags: ["Tasks"],
        summary: "Start a task",
        description: "Starting or resuming PM work atomically supersedes untouched open tasks for the same asset/facility and template. Worked or submitted tasks are preserved. PM_ACTIVE_WORK_EXISTS returns 409 when another protected execution exists.",
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
          "409": {
            description: "Broken-asset PM tasks are cancelled and cannot be started",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
        },
      },
    },
    "/api/tasks/{taskId}/draft": {
      get: {
        tags: ["Tasks"],
        summary: "Get my draft checklist entries for task",
        parameters: [
          { name: "taskId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        responses: {
          "200": { description: "OK" },
          "400": { description: "Invalid request" },
          "403": { description: "Forbidden" },
          "404": { description: "Not found" },
          "409": { description: "Submitted PM tasks are locked for draft editing" },
        },
        security: [{ bearerAuth: [] }],
      },
      patch: {
        tags: ["Tasks"],
        summary: "Save my draft checklist entries for task",
        parameters: [
          { name: "taskId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        requestBody: { required: true },
        responses: {
          "200": { description: "OK" },
          "400": { description: "Invalid request" },
          "403": { description: "Forbidden" },
          "404": { description: "Not found" },
          "409": { description: "Submitted PM tasks are locked for draft editing" },
        },
        security: [{ bearerAuth: [] }],
      },
      delete: {
        tags: ["Tasks"],
        summary: "Clear my draft checklist entries for task",
        parameters: [
          { name: "taskId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        responses: {
          "200": { description: "OK" },
          "400": { description: "Invalid request" },
          "403": { description: "Forbidden" },
          "404": { description: "Not found" },
          "409": { description: "Submitted PM tasks are locked for draft editing" },
        },
        security: [{ bearerAuth: [] }],
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
          "409": {
            description: "Broken-asset PM tasks are cancelled and cannot be paused",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
        },
      },
    },
    "/api/tasks/{taskId}/resume": {
      post: {
        tags: ["Tasks"],
        summary: "Resume a task",
        description: "Starting or resuming PM work atomically supersedes untouched open tasks for the same asset/facility and template. Worked or submitted tasks are preserved. PM_ACTIVE_WORK_EXISTS returns 409 when another protected execution exists.",
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
          "409": {
            description: "Broken-asset PM tasks are cancelled and cannot be resumed",
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
    "/api/tasks/{taskId}/reopen": {
      post: {
        tags: ["Tasks"],
        summary: "Reopen a cancelled task",
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
          "409": {
            description: "Broken assets remain blocked; PM_CONTEXT_UNAVAILABLE when the context is inactive, PM is disabled, site is missing, or the task template is not the active category-compatible default template; PM_OCCURRENCE_FULFILLED when a historical alias was fulfilled by another task; PM_TASK_RETIRED when a task is automatically superseded or missed",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
        },
      },
    },
    "/api/tasks/{taskId}/complete": {
      post: {
        tags: ["Tasks"],
        summary: "Complete a task",
        description: "Uses the single active PM context lock; PM_ACTIVE_WORK_EXISTS returns 409 for a competing execution.",
        parameters: [
          { name: "taskId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        requestBody: {
          required: false,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/WorkOrderCompleteRequest" },
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
          "409": {
            description: "Broken-asset PM tasks are cancelled and cannot be completed",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
        },
      },
    },
    "/api/tasks/{taskId}/submit-for-approval": {
      post: {
        tags: ["Tasks"],
        summary: "Submit task for approval",
        description:
          "For PM tasks, the first successful technician submission captures a frozen checklist snapshot that later detail, review, export, and resubmission flows continue to use. Any open PM work session is closed at the submitted timestamp so review waiting time is not counted as active execution time. Uses the single active PM context lock; PM_ACTIVE_WORK_EXISTS returns 409 for a competing execution.",
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
                  checklistResults: {
                    type: "array",
                    items: { $ref: "#/components/schemas/WorkOrderChecklistResult" },
                  },
                },
                additionalProperties: false,
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
          "409": {
            description: "Broken-asset PM tasks are cancelled and cannot be submitted",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
        },
      },
    },
    "/api/tasks/{taskId}/approve-by-supervisor": {
      post: {
        tags: ["Tasks"],
        summary: "Approve by supervisor",
        description:
          "Moves a PM task from `PendingSupervisor` to `PendingSuperadmin`. Supervisor, Admin or Superadmin may review; a Supervisor may review their own submission at this stage. Other same-user reviewers remain forbidden; final Superadmin approval still requires a different reviewer.",
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
        description:
          "Final PM approval step. Only Superadmin may call it, and the reviewer must not be the same user who submitted the PM work for approval.",
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
    "/api/tasks/{taskId}/revise-approval": {
      post: {
        tags: ["Tasks"],
        summary: "Revise approval",
        description:
          "Return the submitted PM task for correction. A nonblank reason is required. A Supervisor may review their own submission only at PendingSupervisor; same-user review at PendingSuperadmin remains forbidden. Existing route role restrictions apply.",
        parameters: [
          { name: "taskId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  reason: { type: "string", minLength: 1, maxLength: 1024 },
                  reopenTask: { type: "boolean" },
                },
                required: ["reason"],
                additionalProperties: false,
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
    "/api/tasks/{taskId}/reject-approval": {
      post: {
        tags: ["Tasks"],
        summary: "Reject approval",
        description:
          "Reject the submitted PM task and create or reuse one linked replacement PM task for the repeated work. The original rejected task keeps its history, results, evidence, and work time. A Supervisor may review their own submission only at PendingSupervisor; same-user review at PendingSuperadmin remains forbidden. Existing route role restrictions apply.",
        parameters: [
          { name: "taskId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  reason: { type: "string", minLength: 1, maxLength: 1024 },
                  reopenTask: {
                    type: "boolean",
                    description: "Must be omitted or false; rejected PM work does not reopen the same task.",
                  },
                },
                required: ["reason"],
                additionalProperties: false,
              },
            },
          },
        },
        responses: {
          "200": {
            description: "OK",
            content: { "application/json": { schema: { $ref: "#/components/schemas/RejectApprovalResponse" } } },
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
      "delete": {
        "tags": [
          "Notifications"
        ],
        "summary": "Delete unused notification channel",
        "description": "Admin or Superadmin only. Returns 409 if notification rules or logs reference the channel; returns 404 if no channel is deleted.",
        "parameters": [
          {
            "name": "channelId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string",
              "format": "uuid"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "OK",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/OkResponse"
                }
              }
            }
          },
          "400": {
            "description": "Invalid request or state",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "401": {
            "description": "Missing or invalid bearer token",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "403": {
            "description": "Forbidden",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "404": {
            "description": "Not found",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "409": {
            "description": "Conflict",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        }
      },

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
    "/api/system/logs": {
      get: {
        tags: ["System"],
        summary: "List system log entries",
        parameters: [
          { name: "page", in: "query", required: false, schema: { type: "integer", default: 1, minimum: 1 } },
          { name: "pageSize", in: "query", required: false, schema: { type: "integer", default: 50, minimum: 1, maximum: 200 } },
          { name: "level", in: "query", required: false, schema: { type: "string", maxLength: 16 } },
        ],
        responses: {
          "200": { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/SystemLogsResponse" } } } },
          "400": { description: "Invalid request", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          "401": { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          "403": { description: "Forbidden", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
    },
    "/api/dashboard/overview": {
      get: {
        tags: ["Dashboard"],
        summary: "Get PM dashboard overview",
        description:
          "Returns the desktop dashboard overview. Due/upcoming/overdue counts and the compliance trend are PM-only and use UTC `ScheduledDueAt` windows; cancelled tasks are excluded from those PM KPI aggregates.",
        responses: {
          "200": { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/DashboardOverviewResponse" } } } },
          "401": { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
    },
    "/api/reports/overdue": {
      get: {
        tags: ["Reports"],
        summary: "List current overdue tasks",
        description:
          "Returns unfinished, uncancelled tasks whose UTC `ScheduledDueAt` is earlier than the request time. Asset and facility contexts are both included; category filtering applies only to asset-backed tasks.",
        parameters: [
          { name: "page", in: "query", required: false, schema: { type: "integer", default: 1, minimum: 1 } },
          { name: "pageSize", in: "query", required: false, schema: { type: "integer", default: 50, minimum: 1, maximum: 200 } },
          { name: "locationId", in: "query", required: false, schema: { type: "string", format: "uuid" } },
          { name: "categoryId", in: "query", required: false, schema: { type: "string", format: "uuid" } },
          { name: "maintenanceType", in: "query", required: false, schema: { type: "string", enum: ["PM", "CM", "all"], default: "PM" } },
        ],
        responses: {
          "200": { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/OverdueReportResponse" } } } },
          "400": { description: "Invalid request", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          "401": { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
    },
    "/api/reports/overdue/export.csv": {
      get: {
        tags: ["Reports"],
        summary: "Export current overdue tasks as CSV",
        description:
          "Exports the same overdue population as `GET /api/reports/overdue`, including asset or facility context columns.",
        parameters: [
          { name: "locationId", in: "query", required: false, schema: { type: "string", format: "uuid" } },
          { name: "categoryId", in: "query", required: false, schema: { type: "string", format: "uuid" } },
          { name: "maintenanceType", in: "query", required: false, schema: { type: "string", enum: ["PM", "CM", "all"], default: "PM" } },
        ],
        responses: {
          "200": { description: "CSV export", content: { "text/csv": { schema: { type: "string", format: "binary" } } } },
          "400": { description: "Invalid request", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          "401": { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
    },
    "/api/reports/compliance": {
      get: {
        tags: ["Reports"],
        summary: "Get compliance summary",
        description:
          "Uses UTC `ScheduledDueAt` between `from` and `to` as the denominator, excludes cancelled tasks from the denominator, applies location to asset or facility context, and applies `approvedOnly=true` only to the completion numerators. `currentlyOverdue` is evaluated at request time against unfinished, uncancelled tasks in the same filtered window.",
        parameters: [
          { name: "from", in: "query", required: true, schema: { type: "string", format: "date-time" } },
          { name: "to", in: "query", required: true, schema: { type: "string", format: "date-time" } },
          { name: "locationId", in: "query", required: false, schema: { type: "string", format: "uuid" } },
          { name: "categoryId", in: "query", required: false, schema: { type: "string", format: "uuid" } },
          { name: "maintenanceType", in: "query", required: false, schema: { type: "string", enum: ["PM", "CM", "all"], default: "PM" } },
          { name: "approvedOnly", in: "query", required: false, schema: { type: "string", enum: ["true", "false"] } },
        ],
        responses: {
          "200": { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/ComplianceReportResponse" } } } },
          "400": { description: "Invalid request", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          "401": { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
    },
    "/api/reports/compliance/export.csv": {
      get: {
        tags: ["Reports"],
        summary: "Export compliance summary as CSV",
        parameters: [
          { name: "from", in: "query", required: true, schema: { type: "string", format: "date-time" } },
          { name: "to", in: "query", required: true, schema: { type: "string", format: "date-time" } },
          { name: "locationId", in: "query", required: false, schema: { type: "string", format: "uuid" } },
          { name: "categoryId", in: "query", required: false, schema: { type: "string", format: "uuid" } },
          { name: "maintenanceType", in: "query", required: false, schema: { type: "string", enum: ["PM", "CM", "all"], default: "PM" } },
          { name: "approvedOnly", in: "query", required: false, schema: { type: "string", enum: ["true", "false"] } },
        ],
        responses: {
          "200": { description: "CSV export", content: { "text/csv": { schema: { type: "string", format: "binary" } } } },
          "400": { description: "Invalid request", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          "401": { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
    },
    "/api/reports/cm/metrics": {
      get: {
        tags: ["Reports"],
        summary: "Get corrective maintenance metrics",
        description:
          "Returns corrective maintenance breakdowns filtered by UTC `ReportedAt` between `from` and `to`. MTTR is the average reported-to-completed duration (`ReportedAt` to `CompletedAt`), not downtime interval duration and not technician active labor time.",
        parameters: [
          { name: "from", in: "query", required: true, schema: { type: "string", format: "date-time" } },
          { name: "to", in: "query", required: true, schema: { type: "string", format: "date-time" } },
          { name: "locationId", in: "query", required: false, schema: { type: "string", format: "uuid" } },
          { name: "categoryId", in: "query", required: false, schema: { type: "string", format: "uuid" } },
        ],
        responses: {
          "200": { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/CmMetricsResponse" } } } },
          "400": { description: "Invalid request", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          "401": { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
    },
    "/api/reports/cm/metrics/export.csv": {
      get: {
        tags: ["Reports"],
        summary: "Export corrective maintenance metrics as CSV",
        parameters: [
          { name: "from", in: "query", required: true, schema: { type: "string", format: "date-time" } },
          { name: "to", in: "query", required: true, schema: { type: "string", format: "date-time" } },
          { name: "locationId", in: "query", required: false, schema: { type: "string", format: "uuid" } },
          { name: "categoryId", in: "query", required: false, schema: { type: "string", format: "uuid" } },
        ],
        responses: {
          "200": { description: "CSV export", content: { "text/csv": { schema: { type: "string", format: "binary" } } } },
          "400": { description: "Invalid request", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          "401": { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
    },
    "/api/reports/system-logs/export.csv": {
      get: {
        tags: ["Reports"],
        summary: "Export system logs as CSV",
        parameters: [
          { name: "from", in: "query", required: true, schema: { type: "string", format: "date-time" } },
          { name: "to", in: "query", required: true, schema: { type: "string", format: "date-time" } },
          { name: "level", in: "query", required: false, schema: { type: "string", maxLength: 16 } },
          { name: "maxRows", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: 20000 } },
        ],
        responses: {
          "200": { description: "CSV export", content: { "text/csv": { schema: { type: "string", format: "binary" } } } },
          "400": { description: "Invalid request", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          "401": { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
    },
    "/api/reports/assets-without-pm/export.csv": {
      get: {
        tags: ["Reports"],
        summary: "Export assets without PM coverage as CSV",
        parameters: [
          { name: "locationId", in: "query", required: false, schema: { type: "string", format: "uuid" } },
          { name: "categoryId", in: "query", required: false, schema: { type: "string", format: "uuid" } },
        ],
        responses: {
          "200": { description: "CSV export", content: { "text/csv": { schema: { type: "string", format: "binary" } } } },
          "400": { description: "Invalid request", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          "401": { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
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
        description:
          "Creates a new CM work order or reuses the existing one when the same failed PM finding already has a linked work order.",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/WorkOrderCreateRequest" } } },
        },
        responses: {
          "200": { description: "Existing linked work order reused", content: { "application/json": { schema: { $ref: "#/components/schemas/WorkOrderCreateResponse" } } } },
          "201": { description: "Created", content: { "application/json": { schema: { $ref: "#/components/schemas/WorkOrderCreateResponse" } } } },
          "400": { description: "Invalid request", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          "401": { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          "403": { description: "Forbidden", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
    },
    "/api/work-orders/{taskId}": {
      "delete": {
        "tags": [
          "Work orders"
        ],
        "summary": "Delete corrective work order",
        "description": "Superadmin only. CM only; PM or missing IDs return 404. Atomically deletes task-owned evidence/results/snapshots, drafts, work sessions, CM events/intervals and the task, with an audit entry. Scheduling history, notification logs or incoming source/recurrence links block deletion with 409 TASK_REFERENCED. Other work orders are never cascaded. Evidence files are removed best-effort after commit.",
        "parameters": [
          {
            "name": "taskId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string",
              "format": "uuid"
            }
          }
        ],
        "responses": {
          "409": {
            "description": "TASK_REFERENCED: independent history or another task references this task; no deletion is performed",
            "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorResponse" } } }
          },
          "200": {
            "description": "OK",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/OkResponse"
                }
              }
            }
          },
          "400": {
            "description": "Invalid request or state",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "401": {
            "description": "Missing or invalid bearer token",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "403": {
            "description": "Forbidden",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "404": {
            "description": "Not found",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        }
      },

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
        summary: "Submit repair completion for review",
        parameters: [ { name: "taskId", in: "path", required: true, schema: { type: "string", format: "uuid" } } ],
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/WorkOrderCompleteRequest" } } } },
        responses: {
          "200": { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/OkResponse" } } } },
          "400": { description: "Invalid request", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          "401": { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          "403": { description: "Forbidden", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          "404": { description: "Not found", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          "409": { description: "Invalid state", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
    },
    "/api/work-orders/{taskId}/verify-close": {
      post: {
        tags: ["Work Orders"],
        summary: "Verify repair and close work order",
        parameters: [ { name: "taskId", in: "path", required: true, schema: { type: "string", format: "uuid" } } ],
        responses: {
          "200": { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/OkResponse" } } } },
          "400": { description: "Invalid request", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          "401": { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          "403": { description: "Forbidden", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          "404": { description: "Not found", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          "409": { description: "Invalid state", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
    },
    "/api/work-orders/{taskId}/return-for-correction": {
      post: {
        tags: ["Work Orders"],
        summary: "Return work order to technician for correction",
        parameters: [ { name: "taskId", in: "path", required: true, schema: { type: "string", format: "uuid" } } ],
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/WorkOrderReturnForCorrectionRequest" } } } },
        responses: {
          "200": { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/OkResponse" } } } },
          "400": { description: "Invalid request", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          "401": { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          "403": { description: "Forbidden", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          "404": { description: "Not found", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          "409": { description: "Invalid state", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
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
        summary: "Record equipment restoration",
        parameters: [ { name: "taskId", in: "path", required: true, schema: { type: "string", format: "uuid" } } ],
        requestBody: { required: false, content: { "application/json": { schema: { $ref: "#/components/schemas/WorkOrderRestorationRequest" } } } },
        responses: {
          "200": { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/OkResponse" } } } },
          "400": { description: "Invalid request", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          "401": { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          "403": { description: "Forbidden", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          "404": { description: "Not found", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          "409": { description: "Invalid state", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
    },
    "/api/work-orders/{taskId}/reopen-downtime": {
      post: {
        tags: ["Work Orders"],
        summary: "Reopen downtime on the same work order",
        parameters: [ { name: "taskId", in: "path", required: true, schema: { type: "string", format: "uuid" } } ],
        requestBody: { required: false, content: { "application/json": { schema: { $ref: "#/components/schemas/WorkOrderReopenDowntimeRequest" } } } },
        responses: {
          "200": { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/OkResponse" } } } },
          "400": { description: "Invalid request", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          "401": { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          "403": { description: "Forbidden", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          "404": { description: "Not found", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          "409": { description: "Invalid state", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
    },
    "/api/work-orders/{taskId}/report-recurrence": {
      post: {
        tags: ["Work Orders"],
        summary: "Create a linked recurrence work order after closure",
        parameters: [ { name: "taskId", in: "path", required: true, schema: { type: "string", format: "uuid" } } ],
        requestBody: { required: false, content: { "application/json": { schema: { $ref: "#/components/schemas/WorkOrderReportRecurrenceRequest" } } } },
        responses: {
          "201": { description: "Created", content: { "application/json": { schema: { $ref: "#/components/schemas/WorkOrderCreateResponse" } } } },
          "400": { description: "Invalid request", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          "401": { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          "404": { description: "Not found", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          "409": { description: "Invalid state", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
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
const alwaysAllowedOrigins = new Set<string>(["http://localhost", "https://localhost", "capacitor://localhost"]);
const localhostWithPortPattern = /^(https?:\/\/localhost:\d+)$/i;

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

  if (alwaysAllowedOrigins.has(origin)) {
    callback(null, true);
    return;
  }

  if (localhostWithPortPattern.test(origin) || originMatchers.some((m) => m.test(origin))) {
    callback(null, true);
    return;
  }

  callback(new Error(`Not allowed by CORS: ${origin}`));
};

app.use(
  cors({
    origin: originConfig,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    exposedHeaders: ["Content-Disposition"],
  }),
);

app.options(
  "*",
  cors({
    origin: originConfig,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
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
app.use("/api/app-updates", appUpdatesRouter);
app.use("/api/system", systemRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/devices", devicesRouter);

app.listen(env.BACKEND_PORT, () => {
  process.stdout.write(`Backend listening on http://localhost:${env.BACKEND_PORT}\n`);
  void startJobs();
});
