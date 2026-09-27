export const managerRoles = ["Superadmin", "Admin", "Supervisor"] as const;

export type TaskOwnershipAccess = {
  assignedToUserId?: string | null;
  assignedToRoleName?: string | null;
  approvalStatus?: string | null;
  maintenanceType?: string | null;
};

export const isManagerUser = (roles: readonly string[]): boolean =>
  roles.some((role) => (managerRoles as readonly string[]).includes(role));

export const canModifyAssignedTask = (
  userId: string,
  userRoles: readonly string[],
  task: TaskOwnershipAccess,
): boolean => {
  if (isManagerUser(userRoles)) return true;
  if (task.assignedToUserId) return task.assignedToUserId === userId;
  if (task.assignedToRoleName) return userRoles.includes(task.assignedToRoleName);
  return false;
};

export const canClaimRoleTask = (
  userId: string,
  userRoles: readonly string[],
  task: TaskOwnershipAccess,
): boolean => {
  if (task.assignedToUserId) return task.assignedToUserId === userId;
  if (!task.assignedToRoleName) return false;
  return userRoles.includes(task.assignedToRoleName);
};

export const isTaskAssignmentLocked = (task: TaskOwnershipAccess): boolean => {
  if (task.maintenanceType !== "PM") return false;
  return (
    task.approvalStatus === "PendingSupervisor" ||
    task.approvalStatus === "PendingSuperadmin" ||
    task.approvalStatus === "Approved"
  );
};
