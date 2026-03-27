import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { trpc } from "@/trpc";
import { useAuth } from "@/hooks/use-auth";
import { ConfirmDialog } from "@/components/confirm-dialog";

export const Route = createFileRoute("/_app/admin/users")({
  component: AdminUsersPage,
});

function AdminUsersPage() {
  const { user: currentUser } = useAuth();
  const navigate = useNavigate();
  const utils = trpc.useUtils();

  // Access control
  useEffect(() => {
    if (currentUser && currentUser.role !== "admin") {
      navigate({ to: "/home" });
    }
  }, [currentUser, navigate]);

  const usersQuery = trpc.admin.listUsers.useQuery();

  // Create user form state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createDisplayName, setCreateDisplayName] = useState("");
  const [createEmail, setCreateEmail] = useState("");
  const [createPassword, setCreatePassword] = useState("");
  const [createRole, setCreateRole] = useState<"admin" | "user">("user");
  const [createError, setCreateError] = useState("");

  // Confirm dialog state
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    message: string;
    confirmLabel: string;
    destructive: boolean;
    onConfirm: () => void;
  }>({
    open: false,
    title: "",
    message: "",
    confirmLabel: "Confirm",
    destructive: false,
    onConfirm: () => {},
  });

  const createUser = trpc.admin.createUser.useMutation({
    onSuccess: () => {
      utils.admin.listUsers.invalidate();
      setShowCreateForm(false);
      setCreateDisplayName("");
      setCreateEmail("");
      setCreatePassword("");
      setCreateRole("user");
      setCreateError("");
    },
    onError: (err) => setCreateError(err.message),
  });

  const updateRole = trpc.admin.updateRole.useMutation({
    onSuccess: () => utils.admin.listUsers.invalidate(),
  });

  const deleteUser = trpc.admin.deleteUser.useMutation({
    onSuccess: () => utils.admin.listUsers.invalidate(),
  });

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError("");
    if (createPassword.length < 8) {
      setCreateError("Password must be at least 8 characters");
      return;
    }
    createUser.mutate({
      email: createEmail,
      password: createPassword,
      displayName: createDisplayName,
      role: createRole,
    });
  };

  const handleRoleToggle = (userId: string, currentRole: string, displayName: string) => {
    const newRole = currentRole === "admin" ? "user" : "admin";
    setConfirmDialog({
      open: true,
      title: "Change Role",
      message: `Change ${displayName}'s role from ${currentRole} to ${newRole}?`,
      confirmLabel: "Change Role",
      destructive: false,
      onConfirm: () => {
        updateRole.mutate({ userId, role: newRole });
        setConfirmDialog((prev) => ({ ...prev, open: false }));
      },
    });
  };

  const handleDelete = (userId: string, displayName: string) => {
    setConfirmDialog({
      open: true,
      title: "Delete User",
      message: `Are you sure you want to delete ${displayName}? This action cannot be undone.`,
      confirmLabel: "Delete",
      destructive: true,
      onConfirm: () => {
        deleteUser.mutate({ userId });
        setConfirmDialog((prev) => ({ ...prev, open: false }));
      },
    });
  };

  if (currentUser?.role !== "admin") return null;

  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <div className="flex items-center justify-between mb-8">
        <h1
          className="font-display text-2xl font-bold"
          style={{ color: "var(--text)" }}
        >
          Users
        </h1>
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="px-4 py-2 rounded-full text-sm font-semibold text-white transition-transform hover:scale-[1.02]"
          style={{ backgroundColor: "var(--warm)" }}
        >
          {showCreateForm ? "Cancel" : "Create User"}
        </button>
      </div>

      {/* Create user form */}
      {showCreateForm && (
        <div
          className="rounded-2xl p-6 mb-6"
          style={{ backgroundColor: "var(--card)" }}
        >
          <h2
            className="text-sm font-medium uppercase tracking-wider mb-4"
            style={{ color: "var(--text-dim)" }}
          >
            New User
          </h2>
          <form onSubmit={handleCreateSubmit} className="space-y-4">
            {createError && (
              <div
                className="text-sm p-3 rounded-lg"
                style={{
                  backgroundColor: "rgba(220,38,38,0.1)",
                  color: "#ef4444",
                }}
              >
                {createError}
              </div>
            )}

            <div>
              <label
                className="block text-xs font-medium uppercase tracking-wider mb-1.5"
                style={{ color: "var(--text-dim)" }}
              >
                Display Name
              </label>
              <input
                type="text"
                value={createDisplayName}
                onChange={(e) => setCreateDisplayName(e.target.value)}
                required
                className="w-full rounded-[10px] border px-4 py-2.5 text-sm outline-none transition-colors focus:border-[var(--warm)]"
                style={{
                  backgroundColor: "var(--card)",
                  borderColor: "var(--border)",
                  color: "var(--text)",
                }}
              />
            </div>

            <div>
              <label
                className="block text-xs font-medium uppercase tracking-wider mb-1.5"
                style={{ color: "var(--text-dim)" }}
              >
                Email
              </label>
              <input
                type="email"
                value={createEmail}
                onChange={(e) => setCreateEmail(e.target.value)}
                required
                className="w-full rounded-[10px] border px-4 py-2.5 text-sm outline-none transition-colors focus:border-[var(--warm)]"
                style={{
                  backgroundColor: "var(--card)",
                  borderColor: "var(--border)",
                  color: "var(--text)",
                }}
              />
            </div>

            <div>
              <label
                className="block text-xs font-medium uppercase tracking-wider mb-1.5"
                style={{ color: "var(--text-dim)" }}
              >
                Password
              </label>
              <input
                type="password"
                value={createPassword}
                onChange={(e) => setCreatePassword(e.target.value)}
                required
                minLength={8}
                className="w-full rounded-[10px] border px-4 py-2.5 text-sm outline-none transition-colors focus:border-[var(--warm)]"
                style={{
                  backgroundColor: "var(--card)",
                  borderColor: "var(--border)",
                  color: "var(--text)",
                }}
              />
              <p
                className="text-xs mt-1"
                style={{ color: "var(--text-faint)" }}
              >
                At least 8 characters
              </p>
            </div>

            <div>
              <label
                className="block text-xs font-medium uppercase tracking-wider mb-1.5"
                style={{ color: "var(--text-dim)" }}
              >
                Role
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setCreateRole("user")}
                  className="flex-1 py-2 rounded-[10px] border text-sm font-medium transition-colors"
                  style={{
                    backgroundColor:
                      createRole === "user" ? "var(--warm)" : "transparent",
                    borderColor:
                      createRole === "user" ? "var(--warm)" : "var(--border)",
                    color: createRole === "user" ? "white" : "var(--text-dim)",
                  }}
                >
                  User
                </button>
                <button
                  type="button"
                  onClick={() => setCreateRole("admin")}
                  className="flex-1 py-2 rounded-[10px] border text-sm font-medium transition-colors"
                  style={{
                    backgroundColor:
                      createRole === "admin" ? "var(--warm)" : "transparent",
                    borderColor:
                      createRole === "admin" ? "var(--warm)" : "var(--border)",
                    color: createRole === "admin" ? "white" : "var(--text-dim)",
                  }}
                >
                  Admin
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={createUser.isPending}
              className="w-full py-2.5 rounded-full text-sm font-semibold text-white transition-transform hover:scale-[1.02]"
              style={{ backgroundColor: "var(--warm)" }}
            >
              {createUser.isPending ? "Creating..." : "Create User"}
            </button>
          </form>
        </div>
      )}

      {/* User list */}
      <div className="space-y-3">
        {usersQuery.isLoading && (
          <p className="text-sm" style={{ color: "var(--text-dim)" }}>
            Loading users...
          </p>
        )}

        {usersQuery.data?.map((u) => (
          <div
            key={u.id}
            className="rounded-xl p-4 flex items-center gap-4"
            style={{ backgroundColor: "var(--card)" }}
          >
            {/* Avatar initial */}
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold text-white shrink-0"
              style={{ backgroundColor: "var(--warm)" }}
            >
              {(u.displayName || u.email).charAt(0).toUpperCase()}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div
                className="text-sm font-semibold truncate"
                style={{ color: "var(--text)" }}
              >
                {u.displayName}
              </div>
              <div
                className="text-xs truncate"
                style={{ color: "var(--text-dim)" }}
              >
                {u.email}
              </div>
            </div>

            {/* Role badge */}
            <button
              onClick={() => handleRoleToggle(u.id, u.role, u.displayName)}
              className="px-3 py-1 rounded-full text-xs font-semibold transition-transform hover:scale-[1.05]"
              style={{
                backgroundColor:
                  u.role === "admin"
                    ? "rgba(74,138,90,0.15)"
                    : "rgba(140,140,140,0.15)",
                color:
                  u.role === "admin" ? "var(--green)" : "var(--text-dim)",
              }}
            >
              {u.role}
            </button>

            {/* Delete button */}
            <button
              onClick={() => handleDelete(u.id, u.displayName)}
              disabled={u.id === currentUser?.id}
              className="p-2 rounded-lg transition-colors hover:opacity-80 disabled:opacity-30 disabled:cursor-not-allowed"
              style={{ color: "var(--text-faint)" }}
              title={
                u.id === currentUser?.id
                  ? "You cannot delete yourself"
                  : `Delete ${u.displayName}`
              }
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M2 4h12M5.333 4V2.667a1.333 1.333 0 011.334-1.334h2.666a1.333 1.333 0 011.334 1.334V4m2 0v9.333a1.333 1.333 0 01-1.334 1.334H4.667a1.333 1.333 0 01-1.334-1.334V4h9.334z" />
              </svg>
            </button>
          </div>
        ))}

        {usersQuery.data?.length === 0 && (
          <p className="text-sm" style={{ color: "var(--text-dim)" }}>
            No users found.
          </p>
        )}
      </div>

      <ConfirmDialog
        open={confirmDialog.open}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmLabel={confirmDialog.confirmLabel}
        destructive={confirmDialog.destructive}
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog((prev) => ({ ...prev, open: false }))}
      />
    </div>
  );
}
