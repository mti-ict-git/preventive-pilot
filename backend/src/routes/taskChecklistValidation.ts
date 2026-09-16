import { z } from "zod";

export const checklistOutcomeSchema = z.number().int().min(0).max(2);

export type ChecklistTemplateItem = {
  templateChecklistItemId: string;
  isMandatory: boolean;
  requiresNotes: boolean;
  requiresPassFail: boolean;
  enableAttachment: boolean;
  requiresAttachment: boolean;
  isActive: boolean;
};

export type ChecklistSubmittedResult = {
  templateChecklistItemId: string;
  outcome: number;
  notes?: string | null;
};

export class ChecklistValidationError extends Error {
  constructor(message = "Invalid request") {
    super(message);
    this.name = "ChecklistValidationError";
  }
}

export const requiresNotesForOutcome = (
  item: Pick<ChecklistTemplateItem, "requiresNotes">,
  outcome: ChecklistSubmittedResult["outcome"],
): boolean => {
  if (outcome === 0) return false;
  if (outcome === 2) return true;
  return item.requiresNotes;
};

type ValidateChecklistResultsOptions = {
  templateItems: ChecklistTemplateItem[];
  checklistResults: ChecklistSubmittedResult[];
  checklistEvidenceItemIds?: Iterable<string>;
  requireMandatoryItems?: boolean;
};

export const validateChecklistResults = ({
  templateItems,
  checklistResults,
  checklistEvidenceItemIds = [],
  requireMandatoryItems = false,
}: ValidateChecklistResultsOptions): void => {
  const activeTemplateItems = templateItems.filter((item) => item.isActive);
  const templateItemById = new Map(activeTemplateItems.map((item) => [item.templateChecklistItemId, item]));
  const evidenceItemIdSet = new Set(checklistEvidenceItemIds);
  const seenItemIds = new Set<string>();

  for (const result of checklistResults) {
    if (seenItemIds.has(result.templateChecklistItemId)) {
      throw new ChecklistValidationError();
    }
    seenItemIds.add(result.templateChecklistItemId);

    const templateItem = templateItemById.get(result.templateChecklistItemId);
    if (!templateItem) {
      throw new ChecklistValidationError();
    }

    if (!templateItem.requiresPassFail && result.outcome === 2) {
      throw new ChecklistValidationError();
    }

    if (templateItem.isMandatory && result.outcome === 0) {
      throw new ChecklistValidationError();
    }

    if (requiresNotesForOutcome(templateItem, result.outcome)) {
      if (!result.notes || result.notes.trim().length === 0) {
        throw new ChecklistValidationError();
      }
    }

    if (templateItem.enableAttachment && templateItem.requiresAttachment && result.outcome !== 0) {
      if (!evidenceItemIdSet.has(result.templateChecklistItemId)) {
        throw new ChecklistValidationError();
      }
    }
  }

  if (!requireMandatoryItems) {
    return;
  }

  for (const templateItem of activeTemplateItems) {
    if (!templateItem.isMandatory) continue;
    if (!seenItemIds.has(templateItem.templateChecklistItemId)) {
      throw new ChecklistValidationError();
    }
  }
};
