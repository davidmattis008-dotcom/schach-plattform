"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { getTacticsDifficulty, getTacticsTheme, tacticsPuzzles } from "@/lib/tactics";
import { ONLINE_TIME_CONTROLS } from "@/app/online/protocol";

type ClubGroup = {
  group_id: string;
  club_id: string;
  club_name: string;
  group_name: string;
  role: "trainer" | "member";
  member_count: number;
  invite_code: string | null;
  is_club_owner: boolean;
};
type ClubMember = {
  user_id: string;
  username: string;
  role: "Vereinsgründer" | "Trainer" | "Mitglied";
  group_count: number;
  joined_at: string;
};
type GroupMember = {
  user_id: string;
  username: string;
  role: string;
  solved_tasks: number;
  attempted_tasks: number;
  joined_at: string;
};
type TrainingPlan = {
  plan_id: string;
  name: string;
  description: string;
  due_at: string | null;
  target_solutions: number | null;
  task_count: number;
  solved_count: number;
};
type TrainingTask = {
  task_id: string;
  plan_id: string | null;
  plan_name: string | null;
  title: string;
  description: string;
  puzzle_id: string;
  due_at: string | null;
  participant_count: number;
  attempted_count: number;
  solved_count: number;
  my_attempts: number;
  my_solved: boolean;
};
type Participation = {
  user_id: string;
  username: string;
  role: string;
  attempts: number;
  solved: boolean;
  last_attempt_at: string | null;
};
type ClubTournament = {
  tournament_id: string;
  name: string;
  initial_seconds: number;
  increment_seconds: number;
  max_players: number;
  status: "open" | "running" | "completed";
  player_count: number;
  is_joined: boolean;
};
type CreatedClub = { club_id: string; group_id: string; invite_code: string };
type CreatedGroup = { group_id: string; invite_code: string };
type GroupSectionErrors = Partial<Record<"members" | "clubMembers" | "plans" | "tasks" | "tournaments", string>>;
type PlanDraft = {
  plan_id: string;
  name: string;
  description: string;
  due_at: string;
  target_solutions: string;
};
type TaskDraft = {
  task_id: string;
  title: string;
  description: string;
  puzzle_id: string;
  plan_id: string;
  due_at: string;
};
type TournamentDraft = {
  tournament_id: string;
  name: string;
  initial_seconds: number;
  increment_seconds: number;
  max_players: number;
};

function errorText(error: unknown) {
  if (typeof error === "object" && error !== null) {
    const code = "code" in error && typeof error.code === "string" ? error.code : "";
    if (/PGRST202|PGRST204|PGRST205|42P01|42883/.test(code)) {
      return "Die Vereinsdatenbank ist noch nicht vollständig eingerichtet. Wende die Vereinsmigrationen in Supabase der Reihe nach an.";
    }
    if ("message" in error && typeof error.message === "string") return error.message;
  }
  if (error instanceof Error) return error.message;
  return "Die Vereinsfunktion ist momentan nicht verfügbar.";
}

function firstRow<T>(data: T | T[] | null): T | null {
  return Array.isArray(data) ? data[0] ?? null : data;
}

function formatDate(value: string | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" }).format(new Date(value));
}

function dateTimeValue(value: string) {
  return value ? new Date(value).toISOString() : null;
}

function dateTimeInput(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export function ChessClubTraining({ adminMode = false }: { adminMode?: boolean }) {
  const clientRef = useRef<ReturnType<typeof createClient> | null>(null);
  const getClient = useCallback(() => {
    if (!clientRef.current) clientRef.current = createClient();
    return clientRef.current;
  }, []);

  const [userId, setUserId] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [groups, setGroups] = useState<ClubGroup[]>([]);
  const [groupId, setGroupId] = useState("");
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [clubMembers, setClubMembers] = useState<ClubMember[]>([]);
  const [plans, setPlans] = useState<TrainingPlan[]>([]);
  const [tasks, setTasks] = useState<TrainingTask[]>([]);
  const [tournaments, setTournaments] = useState<ClubTournament[]>([]);
  const [sectionErrors, setSectionErrors] = useState<GroupSectionErrors>({});
  const [loadingGroup, setLoadingGroup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [clubName, setClubName] = useState("");
  const [clubNameDraft, setClubNameDraft] = useState("");
  const [groupNameDraft, setGroupNameDraft] = useState("");
  const [editingPlan, setEditingPlan] = useState<PlanDraft | null>(null);
  const [editingTask, setEditingTask] = useState<TaskDraft | null>(null);
  const [editingTournament, setEditingTournament] = useState<TournamentDraft | null>(null);
  const [initialGroupName, setInitialGroupName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [newGroupName, setNewGroupName] = useState("");
  const [planName, setPlanName] = useState("");
  const [planDescription, setPlanDescription] = useState("");
  const [planDueAt, setPlanDueAt] = useState("");
  const [planTarget, setPlanTarget] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [taskPuzzleId, setTaskPuzzleId] = useState(tacticsPuzzles[0]?.id ?? "");
  const [taskPlanId, setTaskPlanId] = useState("");
  const [taskDueAt, setTaskDueAt] = useState("");
  const [tournamentName, setTournamentName] = useState("");
  const [tournamentControlId, setTournamentControlId] = useState("5+3");
  const [openParticipationId, setOpenParticipationId] = useState<string | null>(null);
  const [participation, setParticipation] = useState<Record<string, Participation[]>>({});
  const groupRequestId = useRef(0);
  const tournamentControls = ONLINE_TIME_CONTROLS.filter((control) => control.initialSeconds >= 60);
  const selectedGroup = groups.find((group) => group.group_id === groupId) ?? null;
  const isTrainer = !adminMode && selectedGroup?.role === "trainer";
  const isClubOwner = selectedGroup?.is_club_owner === true;

  const loadGroups = useCallback(async (preferredGroupId?: string, fallbackGroup?: ClubGroup) => {
    const { data, error: queryError } = await getClient().rpc(
      adminMode ? "admin_list_chess_club_groups" : "list_my_chess_club_groups",
    );
    if (queryError) throw queryError;
    const nextGroups = (data ?? []) as ClubGroup[];
    const resolvedGroups = fallbackGroup && !nextGroups.some((group) => group.group_id === fallbackGroup.group_id)
      ? [...nextGroups, fallbackGroup]
      : nextGroups;
    setGroups(resolvedGroups);
    setGroupId((current) => {
      const preferred = preferredGroupId ?? current;
      return resolvedGroups.some((group) => group.group_id === preferred)
        ? preferred
        : resolvedGroups[0]?.group_id ?? "";
    });
  }, [adminMode, getClient]);

  const refreshGroup = useCallback(async (selectedGroupId: string, clubId: string) => {
    const requestId = ++groupRequestId.current;
    setLoadingGroup(true);
    setSectionErrors({});
    try {
      const [membersResult, clubMembersResult, plansResult, tasksResult, tournamentsResult] = await Promise.all([
        getClient().rpc("list_chess_club_group_members", { p_group_id: selectedGroupId }),
        getClient().rpc("list_chess_club_members", { p_club_id: clubId }),
        getClient().rpc("list_chess_club_training_plans", { p_group_id: selectedGroupId }),
        getClient().rpc("list_chess_club_training_tasks", { p_group_id: selectedGroupId }),
        getClient().rpc("list_chess_club_group_tournaments", { p_group_id: selectedGroupId }),
      ]);
      if (requestId !== groupRequestId.current) return;

      const errors: GroupSectionErrors = {};
      if (membersResult.error) {
        console.error("Vereinsmitglieder konnten nicht geladen werden:", membersResult.error);
        errors.members = errorText(membersResult.error);
        setMembers([]);
      } else {
        setMembers((membersResult.data ?? []) as GroupMember[]);
      }
      if (clubMembersResult.error) {
        console.error("Vereinsmitglieder konnten nicht geladen werden:", clubMembersResult.error);
        errors.clubMembers = errorText(clubMembersResult.error);
        setClubMembers([]);
      } else {
        setClubMembers((clubMembersResult.data ?? []) as ClubMember[]);
      }
      if (plansResult.error) {
        console.error("Trainingspläne konnten nicht geladen werden:", plansResult.error);
        errors.plans = errorText(plansResult.error);
        setPlans([]);
      } else {
        setPlans((plansResult.data ?? []) as TrainingPlan[]);
      }
      if (tasksResult.error) {
        console.error("Vereinsaufgaben konnten nicht geladen werden:", tasksResult.error);
        errors.tasks = errorText(tasksResult.error);
        setTasks([]);
      } else {
        setTasks((tasksResult.data ?? []) as TrainingTask[]);
      }
      if (tournamentsResult.error) {
        console.error("Vereinsturniere konnten nicht geladen werden:", tournamentsResult.error);
        errors.tournaments = errorText(tournamentsResult.error);
        setTournaments([]);
      } else {
        setTournaments((tournamentsResult.data ?? []) as ClubTournament[]);
      }
      setSectionErrors(errors);
    } catch (loadError) {
      if (requestId === groupRequestId.current) {
        console.error("Vereinsgruppe konnte nicht geladen werden:", loadError);
        setSectionErrors({
          members: errorText(loadError),
          clubMembers: errorText(loadError),
          plans: errorText(loadError),
          tasks: errorText(loadError),
          tournaments: errorText(loadError),
        });
      }
    } finally {
      if (requestId === groupRequestId.current) setLoadingGroup(false);
    }
  }, [getClient]);

  useEffect(() => {
    let active = true;
    async function initialize() {
      try {
        const { data: { user }, error: authError } = await getClient().auth.getUser();
        if (authError) throw authError;
        if (!active) return;
        setUserId(user?.id ?? null);
        if (user) await loadGroups();
      } catch (loadError) {
        if (active) {
          console.error("Vereinsbereiche konnten nicht geladen werden:", loadError);
          setError(errorText(loadError));
        }
      } finally {
        if (active) setAuthLoading(false);
      }
    }
    void initialize();
    return () => { active = false; };
  }, [getClient, loadGroups]);

  useEffect(() => {
    setTaskPlanId("");
    setOpenParticipationId(null);
    setEditingPlan(null);
    setEditingTask(null);
    setEditingTournament(null);
    if (groupId && selectedGroup) void refreshGroup(groupId, selectedGroup.club_id);
    else {
      if (!groupId) {
        groupRequestId.current += 1;
        setLoadingGroup(false);
        setSectionErrors({});
        setMembers([]);
        setClubMembers([]);
        setPlans([]);
        setTasks([]);
        setTournaments([]);
      }
    }
  }, [groupId, groups, refreshGroup, selectedGroup]);

  useEffect(() => {
    setClubNameDraft(selectedGroup?.club_name ?? "");
    setGroupNameDraft(selectedGroup?.group_name ?? "");
  }, [selectedGroup?.club_id, selectedGroup?.club_name, selectedGroup?.group_name]);

  async function createClub(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const { data, error: createError } = await getClient().rpc("create_chess_club", {
        p_name: clubName,
        p_group_name: initialGroupName,
      });
      if (createError) throw createError;
      const created = firstRow(data as CreatedClub[] | CreatedClub | null);
      if (!created) throw new Error("Der Verein wurde angelegt, aber die Gruppeneinladung fehlt.");
      const createdGroup: ClubGroup = {
        club_id: created.club_id,
        group_id: created.group_id,
        club_name: clubName.trim(),
        group_name: initialGroupName.trim(),
        role: "trainer",
        member_count: 1,
        invite_code: created.invite_code,
        is_club_owner: true,
      };
      setGroups((current) => [...current.filter((group) => group.group_id !== created.group_id), createdGroup]);
      setGroupId(created.group_id);
      setClubName("");
      setInitialGroupName("");
      setNotice(`Verein und Trainingsgruppe angelegt. Einladungscode: ${created.invite_code}`);
      try {
        await loadGroups(created.group_id, createdGroup);
      } catch (refreshError) {
        console.error("Verein wurde erstellt, aber die Gruppenliste konnte nicht aktualisiert werden:", refreshError);
        setError(`Verein und Gruppe wurden angelegt. Die Gruppenliste konnte nicht aktualisiert werden: ${errorText(refreshError)}`);
      }
    } catch (createError) {
      console.error("Verein konnte nicht angelegt werden:", createError);
      setError(errorText(createError));
    } finally {
      setBusy(false);
    }
  }

  async function joinGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const { data, error: joinError } = await getClient().rpc("join_chess_club_group", {
        p_invite_code: inviteCode.trim().toUpperCase(),
      });
      if (joinError) throw joinError;
      if (typeof data !== "string") throw new Error("Die Trainingsgruppe konnte nicht eindeutig geöffnet werden.");
      setInviteCode("");
      setNotice("Du bist der Trainingsgruppe beigetreten.");
      try {
        await loadGroups(data);
      } catch (refreshError) {
        console.error("Gruppenbeitritt erfolgreich, aber die Gruppenliste konnte nicht aktualisiert werden:", refreshError);
        setError(`Du bist der Gruppe beigetreten. Die Gruppenliste konnte nicht aktualisiert werden: ${errorText(refreshError)}`);
      }
    } catch (joinError) {
      console.error("Trainingsgruppe konnte nicht beigetreten werden:", joinError);
      setError(errorText(joinError));
    } finally {
      setBusy(false);
    }
  }

  async function createGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedGroup) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const { data, error: createError } = await getClient().rpc("create_chess_club_group", {
        p_club_id: selectedGroup.club_id,
        p_name: newGroupName,
      });
      if (createError) throw createError;
      const created = firstRow(data as CreatedGroup[] | CreatedGroup | null);
      if (!created) throw new Error("Die Trainingsgruppe wurde angelegt, aber der Einladungscode fehlt.");
      const createdGroup: ClubGroup = {
        ...selectedGroup,
        group_id: created.group_id,
        group_name: newGroupName.trim(),
        role: "trainer",
        member_count: 1,
        invite_code: created.invite_code,
      };
      setGroups((current) => [...current.filter((group) => group.group_id !== created.group_id), createdGroup]);
      setGroupId(created.group_id);
      setNewGroupName("");
      setNotice(`Trainingsgruppe angelegt. Einladungscode: ${created.invite_code}`);
      try {
        await loadGroups(created.group_id, createdGroup);
      } catch (refreshError) {
        console.error("Trainingsgruppe wurde erstellt, aber die Gruppenliste konnte nicht aktualisiert werden:", refreshError);
        setError(`Trainingsgruppe wurde angelegt. Die Gruppenliste konnte nicht aktualisiert werden: ${errorText(refreshError)}`);
      }
    } catch (createError) {
      console.error("Trainingsgruppe konnte nicht angelegt werden:", createError);
      setError(errorText(createError));
    } finally {
      setBusy(false);
    }
  }

  async function createPlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!groupId) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const { error: createError } = await getClient().rpc("create_chess_club_training_plan", {
        p_group_id: groupId,
        p_name: planName,
        p_description: planDescription,
        p_due_at: dateTimeValue(planDueAt),
        p_target_solutions: planTarget ? Number(planTarget) : null,
      });
      if (createError) throw createError;
      setPlanName("");
      setPlanDescription("");
      setPlanDueAt("");
      setPlanTarget("");
      setNotice("Gemeinsamer Trainingsplan angelegt.");
      if (selectedGroup) await refreshGroup(groupId, selectedGroup.club_id);
    } catch (createError) {
      console.error("Trainingsplan konnte nicht angelegt werden:", createError);
      setError(errorText(createError));
    } finally {
      setBusy(false);
    }
  }

  async function createTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!groupId) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const { error: createError } = await getClient().rpc("create_chess_club_training_task", {
        p_group_id: groupId,
        p_plan_id: taskPlanId || null,
        p_title: taskTitle,
        p_description: taskDescription,
        p_puzzle_id: taskPuzzleId,
        p_due_at: dateTimeValue(taskDueAt),
      });
      if (createError) throw createError;
      setTaskTitle("");
      setTaskDescription("");
      setTaskDueAt("");
      setNotice("Aufgabe der Trainingsgruppe zugewiesen.");
      if (selectedGroup) await refreshGroup(groupId, selectedGroup.club_id);
    } catch (createError) {
      console.error("Trainingsaufgabe konnte nicht zugewiesen werden:", createError);
      setError(errorText(createError));
    } finally {
      setBusy(false);
    }
  }

  async function createTournament(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!groupId) return;
    const control = tournamentControls.find((item) => item.id === tournamentControlId);
    if (!control) {
      setError("Bitte wähle eine gültige Bedenkzeit.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const { error: createError } = await getClient().rpc("create_chess_club_group_tournament", {
        p_group_id: groupId,
        p_name: tournamentName,
        p_initial_seconds: control.initialSeconds,
        p_increment_seconds: control.incrementSeconds,
        p_max_players: 8,
      });
      if (createError) throw createError;
      setTournamentName("");
      setNotice("Internes Vereinsturnier angelegt. Gruppenmitglieder finden es unter Turniere.");
      if (selectedGroup) await refreshGroup(groupId, selectedGroup.club_id);
    } catch (createError) {
      console.error("Vereinsturnier konnte nicht angelegt werden:", createError);
      setError(errorText(createError));
    } finally {
      setBusy(false);
    }
  }

  async function toggleParticipation(taskId: string) {
    if (openParticipationId === taskId) {
      setOpenParticipationId(null);
      return;
    }
    setError("");
    try {
      const { data, error: queryError } = await getClient().rpc("list_chess_club_task_participation", {
        p_task_id: taskId,
      });
      if (queryError) throw queryError;
      setParticipation((current) => ({ ...current, [taskId]: (data ?? []) as Participation[] }));
      setOpenParticipationId(taskId);
    } catch (queryError) {
      console.error("Aufgabenteilnahme konnte nicht geladen werden:", queryError);
      setError(errorText(queryError));
    }
  }

  async function removeClubMember(member: ClubMember) {
    if (!selectedGroup || !isClubOwner || member.user_id === userId || (member.role === "Vereinsgründer" && !adminMode)) return;
    if (!window.confirm(`Möchtest du ${member.username} wirklich aus dem Verein entfernen? Die Person verliert den Zugang zu allen Vereinsgruppen und internen Turnieren.`)) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const { error: removeError } = await getClient().rpc("remove_chess_club_member", {
        p_club_id: selectedGroup.club_id,
        p_user_id: member.user_id,
      });
      if (removeError) throw removeError;
      setClubMembers((current) => current.filter((currentMember) => currentMember.user_id !== member.user_id));
      setMembers((current) => current.filter((currentMember) => currentMember.user_id !== member.user_id));
      setNotice(`${member.username} wurde aus dem Verein und seinen Trainingsgruppen entfernt.`);
      try {
        await loadGroups(groupId);
      } catch (refreshError) {
        console.error("Mitglied wurde entfernt, aber die Gruppenliste konnte nicht aktualisiert werden:", refreshError);
        setError(`Mitglied wurde entfernt. Die Gruppenliste konnte nicht aktualisiert werden: ${errorText(refreshError)}`);
        await refreshGroup(groupId, selectedGroup.club_id);
      }
    } catch (removeError) {
      console.error("Vereinsmitglied konnte nicht entfernt werden:", removeError);
      setError(errorText(removeError));
    } finally {
      setBusy(false);
    }
  }

  async function saveClubName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedGroup || !isClubOwner) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const { error: updateError } = await getClient().rpc("update_chess_club", {
        p_club_id: selectedGroup.club_id,
        p_name: clubNameDraft,
      });
      if (updateError) throw updateError;
      setNotice("Vereinsname wurde aktualisiert.");
      await loadGroups(groupId);
    } catch (updateError) {
      console.error("Vereinsname konnte nicht geändert werden:", updateError);
      setError(errorText(updateError));
    } finally {
      setBusy(false);
    }
  }

  async function deleteClub() {
    if (!selectedGroup || !isClubOwner) return;
    const confirmation = window.prompt(
      `Damit der Verein "${selectedGroup.club_name}" einschließlich Gruppen, Mitglieder, Pläne, Aufgaben und Vereinsturniere dauerhaft gelöscht wird, gib bitte exakt seinen Namen ein.`,
    );
    if (confirmation?.trim() !== selectedGroup.club_name) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const { error: deleteError } = await getClient().rpc("delete_chess_club", {
        p_club_id: selectedGroup.club_id,
      });
      if (deleteError) throw deleteError;
      setGroups((current) => current.filter((group) => group.club_id !== selectedGroup.club_id));
      setGroupId("");
      setNotice(`Verein „${selectedGroup.club_name}“ und alle Vereinsdaten wurden gelöscht. Bereits verbuchte Online-Wertungen bleiben bestehen.`);
      try {
        await loadGroups();
      } catch (refreshError) {
        console.error("Verein wurde gelöscht, aber die Gruppenliste konnte nicht aktualisiert werden:", refreshError);
        setError(`Verein wurde gelöscht. Die Gruppenliste konnte nicht aktualisiert werden: ${errorText(refreshError)}`);
      }
    } catch (deleteError) {
      console.error("Verein konnte nicht gelöscht werden:", deleteError);
      setError(errorText(deleteError));
    } finally {
      setBusy(false);
    }
  }

  async function saveGroupName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedGroup || !isClubOwner) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const { error: updateError } = await getClient().rpc("update_chess_club_group", {
        p_group_id: selectedGroup.group_id,
        p_name: groupNameDraft,
      });
      if (updateError) throw updateError;
      setNotice("Trainingsgruppe wurde umbenannt.");
      await loadGroups(groupId);
    } catch (updateError) {
      console.error("Trainingsgruppe konnte nicht umbenannt werden:", updateError);
      setError(errorText(updateError));
    } finally {
      setBusy(false);
    }
  }

  async function deleteGroup() {
    if (!selectedGroup || !isClubOwner) return;
    const groupCount = groups.filter((group) => group.club_id === selectedGroup.club_id).length;
    if (groupCount < 2) {
      setError("Die letzte Trainingsgruppe kann nicht einzeln gelöscht werden. Lösche stattdessen den gesamten Verein.");
      return;
    }
    if (!window.confirm(`Trainingsgruppe „${selectedGroup.group_name}“ einschließlich ihrer Pläne, Aufgaben, Mitglieder und Turniere dauerhaft löschen? Bereits verbuchte Online-Wertungen bleiben bestehen.`)) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const { error: deleteError } = await getClient().rpc("delete_chess_club_group", {
        p_group_id: selectedGroup.group_id,
      });
      if (deleteError) throw deleteError;
      setNotice(`Trainingsgruppe „${selectedGroup.group_name}“ und ihre Inhalte wurden gelöscht.`);
      await loadGroups();
    } catch (deleteError) {
      console.error("Trainingsgruppe konnte nicht gelöscht werden:", deleteError);
      setError(errorText(deleteError));
    } finally {
      setBusy(false);
    }
  }

  async function savePlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingPlan || !isClubOwner || !selectedGroup) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const { error: updateError } = await getClient().rpc("update_chess_club_training_plan", {
        p_plan_id: editingPlan.plan_id,
        p_name: editingPlan.name,
        p_description: editingPlan.description,
        p_due_at: dateTimeValue(editingPlan.due_at),
        p_target_solutions: editingPlan.target_solutions ? Number(editingPlan.target_solutions) : null,
      });
      if (updateError) throw updateError;
      setEditingPlan(null);
      setNotice("Trainingsplan wurde aktualisiert.");
      await refreshGroup(groupId, selectedGroup.club_id);
    } catch (updateError) {
      console.error("Trainingsplan konnte nicht geändert werden:", updateError);
      setError(errorText(updateError));
    } finally {
      setBusy(false);
    }
  }

  async function deletePlan(plan: TrainingPlan) {
    if (!isClubOwner || !selectedGroup) return;
    if (!window.confirm(`Trainingsplan „${plan.name}“ löschen? Alle diesem Plan zugeordneten Aufgaben und deren Teilnahme werden ebenfalls gelöscht.`)) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const { error: deleteError } = await getClient().rpc("delete_chess_club_training_plan", {
        p_plan_id: plan.plan_id,
      });
      if (deleteError) throw deleteError;
      setEditingPlan(null);
      setNotice(`Trainingsplan „${plan.name}“ wurde gelöscht.`);
      await refreshGroup(groupId, selectedGroup.club_id);
    } catch (deleteError) {
      console.error("Trainingsplan konnte nicht gelöscht werden:", deleteError);
      setError(errorText(deleteError));
    } finally {
      setBusy(false);
    }
  }

  async function saveTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingTask || !isClubOwner || !selectedGroup) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const { error: updateError } = await getClient().rpc("update_chess_club_training_task", {
        p_task_id: editingTask.task_id,
        p_plan_id: editingTask.plan_id || null,
        p_title: editingTask.title,
        p_description: editingTask.description,
        p_puzzle_id: editingTask.puzzle_id,
        p_due_at: dateTimeValue(editingTask.due_at),
      });
      if (updateError) throw updateError;
      setEditingTask(null);
      setNotice("Taktikaufgabe wurde aktualisiert.");
      await refreshGroup(groupId, selectedGroup.club_id);
    } catch (updateError) {
      console.error("Taktikaufgabe konnte nicht geändert werden:", updateError);
      setError(errorText(updateError));
    } finally {
      setBusy(false);
    }
  }

  async function deleteTask(task: TrainingTask) {
    if (!isClubOwner || !selectedGroup) return;
    if (!window.confirm(`Taktikaufgabe „${task.title}“ einschließlich der erfassten Teilnahme löschen?`)) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const { error: deleteError } = await getClient().rpc("delete_chess_club_training_task", {
        p_task_id: task.task_id,
      });
      if (deleteError) throw deleteError;
      setEditingTask(null);
      setNotice(`Taktikaufgabe „${task.title}“ wurde gelöscht.`);
      await refreshGroup(groupId, selectedGroup.club_id);
    } catch (deleteError) {
      console.error("Taktikaufgabe konnte nicht gelöscht werden:", deleteError);
      setError(errorText(deleteError));
    } finally {
      setBusy(false);
    }
  }

  async function saveTournament(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingTournament || !isClubOwner || !selectedGroup) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const { error: updateError } = await getClient().rpc("update_chess_club_group_tournament", {
        p_tournament_id: editingTournament.tournament_id,
        p_name: editingTournament.name,
        p_initial_seconds: editingTournament.initial_seconds,
        p_increment_seconds: editingTournament.increment_seconds,
        p_max_players: editingTournament.max_players,
      });
      if (updateError) throw updateError;
      setEditingTournament(null);
      setNotice("Vereinsturnier wurde aktualisiert.");
      await refreshGroup(groupId, selectedGroup.club_id);
    } catch (updateError) {
      console.error("Vereinsturnier konnte nicht geändert werden:", updateError);
      setError(errorText(updateError));
    } finally {
      setBusy(false);
    }
  }

  async function deleteTournament(tournament: ClubTournament) {
    if (!isClubOwner || !selectedGroup || tournament.status !== "open") return;
    if (!window.confirm(`Offenes Vereinsturnier „${tournament.name}“ samt Anmeldungen löschen?`)) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const { error: deleteError } = await getClient().rpc("delete_chess_club_group_tournament", {
        p_tournament_id: tournament.tournament_id,
      });
      if (deleteError) throw deleteError;
      setEditingTournament(null);
      setNotice(`Vereinsturnier „${tournament.name}“ wurde gelöscht.`);
      await refreshGroup(groupId, selectedGroup.club_id);
    } catch (deleteError) {
      console.error("Vereinsturnier konnte nicht gelöscht werden:", deleteError);
      setError(errorText(deleteError));
    } finally {
      setBusy(false);
    }
  }

  if (authLoading) {
    return <p className="rounded-xl border border-slate-800 bg-slate-900/50 p-5 text-sm text-slate-400" role="status">Vereinsbereich wird geladen …</p>;
  }

  if (!userId) {
    return (
      <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 sm:p-8">
        <h2 className="text-xl font-semibold">Melde dich an, um den Vereinsbereich zu nutzen.</h2>
        <p className="mt-2 text-sm text-slate-400">Vereine, Trainingsgruppen und Aufgaben sind nur für angemeldete Mitglieder sichtbar.</p>
        <Link href="/login" className="mt-5 inline-flex rounded-lg bg-emerald-400 px-4 py-3 text-sm font-semibold text-slate-950">Anmelden</Link>
      </section>
    );
  }

  return (
    <div className="space-y-8">
      {error && <p className="rounded-xl border border-red-900/70 bg-red-950/30 px-4 py-3 text-sm text-red-200" role="alert">{error}</p>}
      {notice && <p className="rounded-xl border border-emerald-900 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-200" role="status">{notice}</p>}

      {!groups.length ? adminMode ? (
        <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 text-sm text-slate-300">
          Es wurden noch keine Vereine oder Trainingsgruppen angelegt.
        </section>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <form onSubmit={(event) => void createClub(event)} className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-5 sm:p-6">
            <div>
              <h2 className="text-xl font-semibold">Verein einrichten</h2>
              <p className="mt-1 text-sm text-slate-400">Du wirst Vereinsverantwortlicher und Trainer der ersten Gruppe.</p>
            </div>
            <label className="block text-sm font-medium text-slate-200">Vereinsname
              <input required minLength={3} maxLength={80} value={clubName} onChange={(event) => setClubName(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-3" placeholder="Schachverein Beispiel" />
            </label>
            <label className="block text-sm font-medium text-slate-200">Erste Trainingsgruppe
              <input required minLength={2} maxLength={80} value={initialGroupName} onChange={(event) => setInitialGroupName(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-3" placeholder="Jugendtraining" />
            </label>
            <button disabled={busy} className="w-full rounded-lg bg-emerald-400 px-4 py-3 font-semibold text-slate-950 disabled:opacity-50">{busy ? "Wird angelegt …" : "Verein und Gruppe anlegen"}</button>
          </form>
          <form onSubmit={(event) => void joinGroup(event)} className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-5 sm:p-6">
            <div>
              <h2 className="text-xl font-semibold">Gruppe beitreten</h2>
              <p className="mt-1 text-sm text-slate-400">Lass dir den Einladungscode vom Vereinstrainer geben.</p>
            </div>
            <label className="block text-sm font-medium text-slate-200">Einladungscode
              <input required minLength={8} maxLength={32} autoCapitalize="characters" value={inviteCode} onChange={(event) => setInviteCode(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 font-mono uppercase tracking-widest" placeholder="ABC123DEF456" />
            </label>
            <button disabled={busy} className="w-full rounded-lg border border-emerald-400/50 px-4 py-3 font-semibold text-emerald-200 disabled:opacity-50">{busy ? "Wird geprüft …" : "Trainingsgruppe beitreten"}</button>
          </form>
        </div>
      ) : (
        <>
          <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 sm:p-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <label className="min-w-56 flex-1 text-sm font-medium text-slate-300">Verein und Trainingsgruppe
                <select value={groupId} onChange={(event) => setGroupId(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 text-white">
                  {groups.map((group) => <option key={group.group_id} value={group.group_id}>{group.club_name} · {group.group_name}</option>)}
                </select>
              </label>
              {selectedGroup?.invite_code && <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/5 px-4 py-3">
                <p className="text-xs text-slate-400">Einladungscode für diese Gruppe</p>
                <p className="mt-1 font-mono text-lg font-semibold tracking-widest text-emerald-200">{selectedGroup.invite_code}</p>
              </div>}
              <p className="text-sm text-slate-400">{selectedGroup?.member_count ?? 0} Mitglieder · {adminMode ? "Plattformadministration" : isTrainer ? "Trainer" : "Mitglied"}</p>
            </div>
            {isTrainer && <details className="mt-4 border-t border-slate-800 pt-4">
              <summary className="cursor-pointer text-sm font-semibold text-slate-300">Weitere Trainingsgruppe anlegen</summary>
              <form onSubmit={(event) => void createGroup(event)} className="mt-3 flex flex-wrap gap-2">
                <input required minLength={2} maxLength={80} value={newGroupName} onChange={(event) => setNewGroupName(event.target.value)} className="min-w-56 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm" placeholder="Gruppenname" />
                <button disabled={busy} className="rounded-lg border border-slate-700 px-4 py-2.5 text-sm font-semibold hover:border-emerald-400/70 disabled:opacity-50">Gruppe anlegen</button>
              </form>
            </details>}
            {isClubOwner && selectedGroup && <details className="mt-4 border-t border-slate-800 pt-4">
              <summary className="cursor-pointer text-sm font-semibold text-amber-200">Verein und Trainingsgruppe verwalten</summary>
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <form onSubmit={(event) => void saveClubName(event)} className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/50 p-4">
                  <label className="block text-sm text-slate-300">Vereinsname
                    <input required minLength={3} maxLength={80} value={clubNameDraft} onChange={(event) => setClubNameDraft(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5" />
                  </label>
                  <button type="submit" disabled={busy} className="rounded-lg border border-amber-300/40 px-3 py-2 text-xs font-semibold text-amber-200 disabled:opacity-50">Vereinsnamen speichern</button>
                </form>
                <form onSubmit={(event) => void saveGroupName(event)} className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/50 p-4">
                  <label className="block text-sm text-slate-300">Name dieser Trainingsgruppe
                    <input required minLength={2} maxLength={80} value={groupNameDraft} onChange={(event) => setGroupNameDraft(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5" />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <button type="submit" disabled={busy} className="rounded-lg border border-amber-300/40 px-3 py-2 text-xs font-semibold text-amber-200 disabled:opacity-50">Gruppennamen speichern</button>
                    {groups.filter((group) => group.club_id === selectedGroup.club_id).length > 1
                      ? <button type="button" disabled={busy} onClick={() => void deleteGroup()} className="rounded-lg border border-red-900/70 px-3 py-2 text-xs font-semibold text-red-200 disabled:opacity-50">Gruppe löschen</button>
                      : <p className="self-center text-xs text-slate-500">Die letzte Gruppe kann nur zusammen mit dem Verein gelöscht werden.</p>}
                  </div>
                </form>
              </div>
              <div className="mt-4 rounded-xl border border-red-900/50 bg-red-950/20 p-4">
                <p className="text-sm font-semibold text-red-200">Verein dauerhaft löschen</p>
                <p className="mt-1 text-xs text-slate-400">Alle Gruppen, Mitgliedschaften, Trainingspläne, Aufgaben und internen Turniere werden entfernt. Bereits verbuchte Online-Wertungen bleiben bestehen.</p>
                <button type="button" disabled={busy} onClick={() => void deleteClub()} className="mt-3 rounded-lg border border-red-800 px-3 py-2 text-xs font-semibold text-red-200 hover:bg-red-950/50 disabled:opacity-50">Verein löschen …</button>
              </div>
            </details>}
          </section>

          {isTrainer && <div className="grid gap-4 xl:grid-cols-2">
            <form onSubmit={(event) => void createPlan(event)} className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-400">Trainerbereich</p>
                <h2 className="mt-1 text-lg font-semibold">Gemeinsamen Trainingsplan erstellen</h2>
                <p className="mt-1 text-sm text-slate-400">Mit Frist und Teamziel wird der Plan zur lösbaren Gruppen-Challenge.</p>
              </div>
              <input required minLength={3} maxLength={100} value={planName} onChange={(event) => setPlanName(event.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 text-sm" placeholder="Name des Trainingsplans" aria-label="Name des Trainingsplans" />
              <textarea maxLength={500} value={planDescription} onChange={(event) => setPlanDescription(event.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 text-sm" placeholder="Beschreibung (optional)" aria-label="Beschreibung des Trainingsplans" rows={2} />
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs text-slate-400">Frist (optional)
                  <input type="datetime-local" value={planDueAt} onChange={(event) => setPlanDueAt(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-200" />
                </label>
                <label className="text-xs text-slate-400">Teamziel: gelöste Aufgaben (optional)
                  <input type="number" min={1} max={5000} value={planTarget} onChange={(event) => setPlanTarget(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-200" placeholder="z. B. 20" />
                </label>
              </div>
              <button disabled={busy} className="rounded-lg bg-emerald-400 px-4 py-3 text-sm font-semibold text-slate-950 disabled:opacity-50">{busy ? "Wird angelegt …" : "Trainingsplan veröffentlichen"}</button>
            </form>

            <form onSubmit={(event) => void createTask(event)} className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-400">Aufgabe zuweisen</p>
                <h2 className="mt-1 text-lg font-semibold">Taktikaufgabe für die Gruppe</h2>
                <p className="mt-1 text-sm text-slate-400">Die Aufgabe wird online gelöst und die Teilnahme für den Trainer erfasst.</p>
              </div>
              <input required minLength={3} maxLength={100} value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 text-sm" placeholder="Titel der Aufgabe" aria-label="Titel der Aufgabe" />
              <textarea maxLength={500} value={taskDescription} onChange={(event) => setTaskDescription(event.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 text-sm" placeholder="Hinweis für die Gruppe (optional)" aria-label="Beschreibung der Aufgabe" rows={2} />
              <label className="block text-xs text-slate-400">Aufgabe aus dem Taktiktraining
                <select value={taskPuzzleId} onChange={(event) => setTaskPuzzleId(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-white">
                  {tacticsPuzzles.map((puzzle) => <option key={puzzle.id} value={puzzle.id}>{puzzle.id} · {puzzle.rating} Elo · {getTacticsDifficulty(puzzle.rating)} · {getTacticsTheme(puzzle.themes)}</option>)}
                </select>
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs text-slate-400">Trainingsplan (optional)
                  <select value={taskPlanId} onChange={(event) => setTaskPlanId(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white">
                    <option value="">Ohne Trainingsplan</option>
                    {plans.map((plan) => <option key={plan.plan_id} value={plan.plan_id}>{plan.name}</option>)}
                  </select>
                </label>
                <label className="text-xs text-slate-400">Aufgabenfrist (optional)
                  <input type="datetime-local" value={taskDueAt} onChange={(event) => setTaskDueAt(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-200" />
                </label>
              </div>
              <button disabled={busy || tacticsPuzzles.length === 0} className="rounded-lg bg-emerald-400 px-4 py-3 text-sm font-semibold text-slate-950 disabled:opacity-50">{busy ? "Wird zugewiesen …" : "Aufgabe veröffentlichen"}</button>
            </form>

            <form onSubmit={(event) => void createTournament(event)} className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-5 xl:col-span-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-400">Team-Wettkampf</p>
                <h2 className="mt-1 text-lg font-semibold">Internes Vereinsturnier</h2>
                <p className="mt-1 text-sm text-slate-400">Das Turnier ist nur für Mitglieder dieser Trainingsgruppe sichtbar und beitretbar.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
                <input required minLength={3} maxLength={80} value={tournamentName} onChange={(event) => setTournamentName(event.target.value)} className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 text-sm" placeholder="Turniername" aria-label="Turniername" />
                <select value={tournamentControlId} onChange={(event) => setTournamentControlId(event.target.value)} className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-white" aria-label="Bedenkzeit">
                  {tournamentControls.map((control) => <option key={control.id} value={control.id}>{control.label} · {control.group}</option>)}
                </select>
                <button disabled={busy} className="rounded-lg border border-emerald-400/50 px-4 py-3 text-sm font-semibold text-emerald-200 hover:bg-emerald-400/10 disabled:opacity-50">{busy ? "Wird erstellt …" : "Vereinsturnier erstellen"}</button>
              </div>
            </form>
          </div>}

          <section aria-labelledby="plans-heading" className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Gemeinsam trainieren</p>
                <h2 id="plans-heading" className="mt-1 text-xl font-semibold">Trainingspläne & Team-Challenges</h2>
              </div>
              <button type="button" onClick={() => selectedGroup && void refreshGroup(groupId, selectedGroup.club_id)} disabled={loadingGroup} className="text-sm text-slate-400 underline underline-offset-4 hover:text-white disabled:opacity-50">
                {loadingGroup ? "Wird aktualisiert …" : "Daten aktualisieren"}
              </button>
            </div>
            {loadingGroup ? <p className="text-sm text-slate-400">Pläne werden geladen …</p> : plans.length ? (
              <div className="grid gap-3 md:grid-cols-2">
                {plans.map((plan) => {
                  const reachedGoal = plan.target_solutions !== null && plan.solved_count >= plan.target_solutions;
                  const progressPercent = plan.target_solutions ? Math.min(100, Math.round((plan.solved_count / plan.target_solutions) * 100)) : null;
                  return <article key={plan.plan_id} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div><h3 className="font-semibold text-white">{plan.name}</h3><p className="mt-1 text-sm text-slate-400">{plan.description || `${plan.task_count} Aufgaben`}</p></div>
                      {reachedGoal && <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-1 text-xs font-semibold text-emerald-200">Ziel erreicht</span>}
                    </div>
                    <p className="mt-4 text-sm text-slate-300">{plan.task_count} Aufgaben · {plan.solved_count} gelöste Gruppenversuche</p>
                    {plan.due_at && <p className="mt-1 text-xs text-slate-500">Frist: {formatDate(plan.due_at)}</p>}
                    {progressPercent !== null && <div className="mt-4">
                      <div className="mb-1 flex justify-between text-xs text-slate-400"><span>Teamziel</span><span>{plan.solved_count}/{plan.target_solutions}</span></div>
                      <div className="h-2 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-emerald-400 transition-all" style={{ width: `${progressPercent}%` }} /></div>
                    </div>}
                    {isClubOwner && <div className="mt-4 flex gap-2">
                      <button type="button" onClick={() => setEditingPlan({
                        plan_id: plan.plan_id,
                        name: plan.name,
                        description: plan.description,
                        due_at: dateTimeInput(plan.due_at),
                        target_solutions: plan.target_solutions?.toString() ?? "",
                      })} className="rounded-lg border border-amber-300/40 px-3 py-2 text-xs font-semibold text-amber-200">Bearbeiten</button>
                      <button type="button" disabled={busy} onClick={() => void deletePlan(plan)} className="rounded-lg border border-red-900/70 px-3 py-2 text-xs font-semibold text-red-200 disabled:opacity-50">Löschen</button>
                    </div>}
                    {editingPlan?.plan_id === plan.plan_id && <form onSubmit={(event) => void savePlan(event)} className="mt-4 space-y-3 border-t border-slate-800 pt-4">
                      <label className="block text-xs text-slate-400">Planname
                        <input required minLength={3} maxLength={100} value={editingPlan.name} onChange={(event) => setEditingPlan((current) => current ? { ...current, name: event.target.value } : current)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white" />
                      </label>
                      <label className="block text-xs text-slate-400">Beschreibung
                        <textarea maxLength={500} value={editingPlan.description} onChange={(event) => setEditingPlan((current) => current ? { ...current, description: event.target.value } : current)} rows={2} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white" />
                      </label>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="text-xs text-slate-400">Frist
                          <input type="datetime-local" value={editingPlan.due_at} onChange={(event) => setEditingPlan((current) => current ? { ...current, due_at: event.target.value } : current)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white" />
                        </label>
                        <label className="text-xs text-slate-400">Teamziel
                          <input type="number" min={1} max={5000} value={editingPlan.target_solutions} onChange={(event) => setEditingPlan((current) => current ? { ...current, target_solutions: event.target.value } : current)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white" />
                        </label>
                      </div>
                      <div className="flex gap-2">
                        <button type="submit" disabled={busy} className="rounded-lg bg-emerald-400 px-3 py-2 text-xs font-semibold text-slate-950 disabled:opacity-50">Änderungen speichern</button>
                        <button type="button" onClick={() => setEditingPlan(null)} className="rounded-lg border border-slate-700 px-3 py-2 text-xs">Abbrechen</button>
                      </div>
                    </form>}
                  </article>;
                })}
              </div>
            ) : sectionErrors.plans
              ? <p className="rounded-xl border border-red-900/70 bg-red-950/30 p-5 text-sm text-red-200" role="alert">Trainingspläne konnten nicht geladen werden: {sectionErrors.plans}</p>
              : <p className="rounded-xl border border-dashed border-slate-700 p-5 text-sm text-slate-400">Noch keine Trainingspläne. Ein Trainer kann oben den ersten Plan erstellen.</p>}
          </section>

          <section aria-labelledby="tasks-heading" className="space-y-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Aufgaben</p>
              <h2 id="tasks-heading" className="mt-1 text-xl font-semibold">Gruppentraining</h2>
            </div>
            {loadingGroup ? <p className="text-sm text-slate-400">Aufgaben werden geladen …</p> : tasks.length ? (
              <div className="space-y-3">
                {tasks.map((task) => {
                  const puzzle = tacticsPuzzles.find((item) => item.id === task.puzzle_id);
                  return <article key={task.task_id} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="font-semibold text-white">{task.title}</h3>
                        {task.description && <p className="mt-1 text-sm text-slate-400">{task.description}</p>}
                        <p className="mt-2 text-xs text-slate-500">{task.plan_name ? `Plan: ${task.plan_name} · ` : ""}{puzzle ? `${puzzle.rating} Elo · ${getTacticsTheme(puzzle.themes)}` : "Aufgabe nicht verfügbar"}</p>
                      </div>
                      {task.due_at && <span className="rounded-full border border-slate-700 px-2.5 py-1 text-xs text-slate-400">Frist: {formatDate(task.due_at)}</span>}
                    </div>
                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      {puzzle && !adminMode && <Link href={`/taktik?clubTask=${encodeURIComponent(task.task_id)}&puzzle=${encodeURIComponent(task.puzzle_id)}`} className="rounded-lg bg-emerald-400 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-emerald-300">
                        {task.my_solved ? "Noch einmal lösen" : task.my_attempts ? "Weiter üben" : "Aufgabe lösen"} <span aria-hidden="true">→</span>
                      </Link>}
                      <p className="text-xs text-slate-400">{task.solved_count}/{task.participant_count} gelöst · {task.attempted_count} haben begonnen{task.my_solved ? " · Du hast sie gelöst" : ""}</p>
                      {isTrainer && <button type="button" onClick={() => void toggleParticipation(task.task_id)} className="ml-auto text-xs font-medium text-emerald-200 underline underline-offset-4">{openParticipationId === task.task_id ? "Teilnahme schließen" : "Teilnahme ansehen"}</button>}
                    </div>
                    {openParticipationId === task.task_id && <div className="mt-4 border-t border-slate-800 pt-3">
                      <ul className="space-y-2 text-sm">
                        {(participation[task.task_id] ?? []).map((person) => <li key={person.user_id} className="flex justify-between gap-3 text-slate-300"><span>{person.username} <span className="text-xs text-slate-500">· {person.role}</span></span><span className={person.solved ? "text-emerald-200" : "text-slate-500"}>{person.solved ? "Gelöst" : person.attempts ? "Versucht" : "Offen"}{person.attempts > 0 ? ` · ${person.attempts}×` : ""}</span></li>)}
                      </ul>
                    </div>}
                    {isClubOwner && <div className="mt-4 flex gap-2">
                      <button type="button" onClick={() => setEditingTask({
                        task_id: task.task_id,
                        title: task.title,
                        description: task.description,
                        puzzle_id: task.puzzle_id,
                        plan_id: task.plan_id ?? "",
                        due_at: dateTimeInput(task.due_at),
                      })} className="rounded-lg border border-amber-300/40 px-3 py-2 text-xs font-semibold text-amber-200">Bearbeiten</button>
                      <button type="button" disabled={busy} onClick={() => void deleteTask(task)} className="rounded-lg border border-red-900/70 px-3 py-2 text-xs font-semibold text-red-200 disabled:opacity-50">Löschen</button>
                    </div>}
                    {editingTask?.task_id === task.task_id && <form onSubmit={(event) => void saveTask(event)} className="mt-4 space-y-3 border-t border-slate-800 pt-4">
                      <label className="block text-xs text-slate-400">Titel
                        <input required minLength={3} maxLength={100} value={editingTask.title} onChange={(event) => setEditingTask((current) => current ? { ...current, title: event.target.value } : current)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white" />
                      </label>
                      <label className="block text-xs text-slate-400">Beschreibung
                        <textarea maxLength={500} value={editingTask.description} onChange={(event) => setEditingTask((current) => current ? { ...current, description: event.target.value } : current)} rows={2} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white" />
                      </label>
                      <label className="block text-xs text-slate-400">Taktikaufgabe
                        <select value={editingTask.puzzle_id} onChange={(event) => setEditingTask((current) => current ? { ...current, puzzle_id: event.target.value } : current)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white">
                          {tacticsPuzzles.map((item) => <option key={item.id} value={item.id}>{item.id} · {item.rating} Elo · {getTacticsDifficulty(item.rating)}</option>)}
                        </select>
                      </label>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="text-xs text-slate-400">Trainingsplan
                          <select value={editingTask.plan_id} onChange={(event) => setEditingTask((current) => current ? { ...current, plan_id: event.target.value } : current)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white">
                            <option value="">Ohne Trainingsplan</option>
                            {plans.map((plan) => <option key={plan.plan_id} value={plan.plan_id}>{plan.name}</option>)}
                          </select>
                        </label>
                        <label className="text-xs text-slate-400">Frist
                          <input type="datetime-local" value={editingTask.due_at} onChange={(event) => setEditingTask((current) => current ? { ...current, due_at: event.target.value } : current)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white" />
                        </label>
                      </div>
                      <div className="flex gap-2">
                        <button type="submit" disabled={busy} className="rounded-lg bg-emerald-400 px-3 py-2 text-xs font-semibold text-slate-950 disabled:opacity-50">Änderungen speichern</button>
                        <button type="button" onClick={() => setEditingTask(null)} className="rounded-lg border border-slate-700 px-3 py-2 text-xs">Abbrechen</button>
                      </div>
                    </form>}
                  </article>;
                })}
              </div>
            ) : sectionErrors.tasks
              ? <p className="rounded-xl border border-red-900/70 bg-red-950/30 p-5 text-sm text-red-200" role="alert">Gruppenaufgaben konnten nicht geladen werden: {sectionErrors.tasks}</p>
              : <p className="rounded-xl border border-dashed border-slate-700 p-5 text-sm text-slate-400">Noch keine Aufgaben in dieser Gruppe.</p>}
          </section>

          <section aria-labelledby="members-heading" className="space-y-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Übersicht</p>
              <h2 id="members-heading" className="mt-1 text-xl font-semibold">Teilnahme der Gruppe</h2>
            </div>
            <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60">
              {sectionErrors.members && <p className="border-b border-red-900/70 bg-red-950/30 p-5 text-sm text-red-200" role="alert">Gruppenmitglieder konnten nicht geladen werden: {sectionErrors.members}</p>}
              {members.map((member) => <div key={member.user_id} className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-5 py-3 last:border-b-0">
                <div><p className="font-medium text-slate-200">{member.username}</p><p className="text-xs text-slate-500">{member.role} · dabei seit {formatDate(member.joined_at)}</p></div>
                <p className="text-sm tabular-nums text-slate-300">{member.solved_tasks} gelöst · {member.attempted_tasks} bearbeitet</p>
              </div>)}
              {!loadingGroup && !sectionErrors.members && members.length === 0 && <p className="p-5 text-sm text-slate-400">Noch keine Gruppenmitglieder.</p>}
            </div>
          </section>

          <section aria-labelledby="club-members-heading" className="space-y-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Vereinsübersicht</p>
              <h2 id="club-members-heading" className="mt-1 text-xl font-semibold">Mitglieder im Verein</h2>
            </div>
            <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60">
              {sectionErrors.clubMembers && <p className="border-b border-red-900/70 bg-red-950/30 p-5 text-sm text-red-200" role="alert">Vereinsmitglieder konnten nicht geladen werden: {sectionErrors.clubMembers}</p>}
              {clubMembers.map((member) => <div key={member.user_id} className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-5 py-3 last:border-b-0">
                <div><p className="font-medium text-slate-200">{member.username}</p><p className="text-xs text-slate-500">{member.role} · {member.group_count} {member.group_count === 1 ? "Trainingsgruppe" : "Trainingsgruppen"} · dabei seit {formatDate(member.joined_at)}</p></div>
                {isClubOwner && member.user_id !== userId && (adminMode || member.role !== "Vereinsgründer") && <button type="button" disabled={busy} onClick={() => void removeClubMember(member)} className="rounded-lg border border-red-900/70 px-3 py-2 text-xs font-semibold text-red-200 hover:border-red-700 hover:bg-red-950/40 disabled:opacity-50">Aus Verein entfernen</button>}
              </div>)}
              {!loadingGroup && !sectionErrors.clubMembers && clubMembers.length === 0 && <p className="p-5 text-sm text-slate-400">Noch keine Vereinsmitglieder.</p>}
            </div>
          </section>

          <section aria-labelledby="club-tournaments-heading" className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Wettkampf</p>
                <h2 id="club-tournaments-heading" className="mt-1 text-xl font-semibold">Interne Vereinsturniere</h2>
              </div>
              <Link href="/tournaments" className="text-sm text-emerald-200 underline underline-offset-4">Turnierübersicht öffnen</Link>
            </div>
            {loadingGroup ? <p className="text-sm text-slate-400">Vereinsturniere werden geladen …</p> : tournaments.length ? <div className="grid gap-3 md:grid-cols-2">
              {tournaments.map((tournament) => <article key={tournament.tournament_id} className="border-b border-slate-800 p-4 last:border-b-0">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div><h3 className="font-semibold text-white">{tournament.name}</h3><p className="mt-1 text-xs text-slate-400">{tournament.player_count}/{tournament.max_players} Spieler · {tournament.initial_seconds / 60}+{tournament.increment_seconds} · {tournament.status === "open" ? "Anmeldung offen" : tournament.status === "running" ? "Läuft" : "Beendet"}</p></div>
                  <div className="flex items-center gap-3">
                    <p className="text-xs text-slate-500">{tournament.is_joined ? "Du bist angemeldet" : "Nur Gruppenmitglieder"}</p>
                    {!adminMode && <Link href={`/tournaments?clubTournament=${encodeURIComponent(tournament.tournament_id)}`} className="rounded-lg border border-amber-300/40 px-3 py-2 text-xs font-semibold text-amber-200 hover:border-amber-300/80 hover:bg-amber-300/10">Turnier öffnen</Link>}
                    {isClubOwner && tournament.status === "open" && <>
                      <button type="button" onClick={() => setEditingTournament({
                        tournament_id: tournament.tournament_id,
                        name: tournament.name,
                        initial_seconds: tournament.initial_seconds,
                        increment_seconds: tournament.increment_seconds,
                        max_players: tournament.max_players,
                      })} className="rounded-lg border border-amber-300/40 px-3 py-2 text-xs font-semibold text-amber-200">Bearbeiten</button>
                      <button type="button" disabled={busy} onClick={() => void deleteTournament(tournament)} className="rounded-lg border border-red-900/70 px-3 py-2 text-xs font-semibold text-red-200 disabled:opacity-50">Löschen</button>
                    </>}
                  </div>
                </div>
                {editingTournament?.tournament_id === tournament.tournament_id && <form onSubmit={(event) => void saveTournament(event)} className="mt-4 grid gap-3 border-t border-slate-800 pt-4 sm:grid-cols-2">
                  <label className="text-xs text-slate-400">Turniername
                    <input required minLength={3} maxLength={80} value={editingTournament.name} onChange={(event) => setEditingTournament((current) => current ? { ...current, name: event.target.value } : current)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white" />
                  </label>
                  <label className="text-xs text-slate-400">Bedenkzeit
                    <select value={tournamentControls.find((control) => control.initialSeconds === editingTournament.initial_seconds && control.incrementSeconds === editingTournament.increment_seconds)?.id ?? ""} onChange={(event) => {
                      const selectedControl = tournamentControls.find((control) => control.id === event.target.value);
                      if (selectedControl) setEditingTournament((current) => current ? { ...current, initial_seconds: selectedControl.initialSeconds, increment_seconds: selectedControl.incrementSeconds } : current);
                    }} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white">
                      <option value="" disabled>Bitte auswählen</option>
                      {tournamentControls.map((control) => <option key={control.id} value={control.id}>{control.label} · {control.group}</option>)}
                    </select>
                  </label>
                  <label className="text-xs text-slate-400">Maximale Spielerzahl
                    <input type="number" min={2} max={16} value={editingTournament.max_players} onChange={(event) => setEditingTournament((current) => current ? { ...current, max_players: Number(event.target.value) } : current)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white" />
                  </label>
                  <div className="flex items-end gap-2">
                    <button type="submit" disabled={busy} className="rounded-lg bg-emerald-400 px-3 py-2 text-xs font-semibold text-slate-950 disabled:opacity-50">Änderungen speichern</button>
                    <button type="button" onClick={() => setEditingTournament(null)} className="rounded-lg border border-slate-700 px-3 py-2 text-xs">Abbrechen</button>
                  </div>
                </form>}
                {isClubOwner && tournament.status !== "open" && <p className="mt-3 text-xs text-slate-500">Laufende oder beendete Turniere sind gesperrt, damit Ergebnisse erhalten bleiben.</p>}
              </article>)}
            </div> : sectionErrors.tournaments
              ? <p className="rounded-xl border border-red-900/70 bg-red-950/30 p-5 text-sm text-red-200" role="alert">Vereinsturniere konnten nicht geladen werden: {sectionErrors.tournaments}</p>
              : <p className="rounded-xl border border-dashed border-slate-700 p-5 text-sm text-slate-400">{isTrainer ? "Noch kein Vereinsturnier. Erstelle oben das erste." : "Für diese Gruppe wurde noch kein Vereinsturnier angelegt."}</p>}
          </section>

          {!adminMode && <details className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
            <summary className="cursor-pointer text-sm font-semibold text-slate-300">Weitere Gruppe beitreten</summary>
            <form onSubmit={(event) => void joinGroup(event)} className="mt-3 flex flex-wrap gap-2">
              <input required minLength={8} maxLength={32} value={inviteCode} onChange={(event) => setInviteCode(event.target.value)} className="min-w-56 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 font-mono text-sm uppercase tracking-widest" placeholder="Einladungscode" aria-label="Einladungscode" />
              <button disabled={busy} className="rounded-lg border border-slate-700 px-4 py-2.5 text-sm font-semibold hover:border-emerald-400/70 disabled:opacity-50">{busy ? "Wird geprüft …" : "Beitreten"}</button>
            </form>
          </details>}
        </>
      )}
    </div>
  );
}
