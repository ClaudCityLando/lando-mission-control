"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from "react";

import type { Project, ProjectTile, ProjectsStore } from "../lib/projects/types";
import {
  createProject as apiCreateProject,
  deleteProject as apiDeleteProject,
  fetchProjectsStore,
  saveProjectsStore,
} from "../lib/projects/client";

export type AgentStatus = "idle" | "running" | "error";

export type TilePosition = { x: number; y: number };
export type TileSize = { width: number; height: number };

export type AgentTile = ProjectTile & {
  status: AgentStatus;
  outputLines: string[];
  lastResult: string | null;
  lastDiff: string | null;
  runId: string | null;
  streamText: string | null;
  draft: string;
};

export type ProjectRuntime = Project & {
  tiles: AgentTile[];
};

export type CanvasTransform = {
  zoom: number;
  offsetX: number;
  offsetY: number;
};

export type CanvasState = {
  projects: ProjectRuntime[];
  activeProjectId: string | null;
  selectedTileId: string | null;
  canvas: CanvasTransform;
  loading: boolean;
  error: string | null;
};

type Action =
  | { type: "loadStore"; store: ProjectsStore }
  | { type: "setError"; error: string | null }
  | { type: "setActiveProject"; projectId: string | null }
  | { type: "addProject"; project: ProjectRuntime }
  | { type: "removeProject"; projectId: string }
  | { type: "updateProject"; projectId: string; patch: Partial<ProjectRuntime> }
  | { type: "addTile"; projectId: string; tile: AgentTile }
  | { type: "removeTile"; projectId: string; tileId: string }
  | { type: "updateTile"; projectId: string; tileId: string; patch: Partial<AgentTile> }
  | { type: "appendOutput"; projectId: string; tileId: string; line: string }
  | { type: "setStream"; projectId: string; tileId: string; value: string | null }
  | { type: "selectTile"; tileId: string | null }
  | { type: "setCanvas"; patch: Partial<CanvasTransform> };

const initialState: CanvasState = {
  projects: [],
  activeProjectId: null,
  selectedTileId: null,
  canvas: { zoom: 1, offsetX: 0, offsetY: 0 },
  loading: true,
  error: null,
};

const buildSessionKey = (projectId: string, tileId: string) =>
  `agent:main:proj-${projectId}-${tileId}`;

const createRuntimeTile = (projectId: string, tile: ProjectTile): AgentTile => ({
  ...tile,
  sessionKey: tile.sessionKey || buildSessionKey(projectId, tile.id),
  model: tile.model ?? "zai/glm-4.7",
  thinkingLevel: tile.thinkingLevel ?? "low",
  status: "idle",
  outputLines: [],
  lastResult: null,
  lastDiff: null,
  runId: null,
  streamText: null,
  draft: "",
});

const hydrateProject = (project: Project): ProjectRuntime => ({
  ...project,
  tiles: Array.isArray(project.tiles)
    ? project.tiles.map((tile) => createRuntimeTile(project.id, tile))
    : [],
});

const dehydrateStore = (state: CanvasState): ProjectsStore => ({
  version: 1,
  activeProjectId: state.activeProjectId,
  projects: state.projects.map((project) => ({
    id: project.id,
    name: project.name,
    repoPath: project.repoPath,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    tiles: project.tiles.map((tile) => ({
      id: tile.id,
      name: tile.name,
      sessionKey: tile.sessionKey,
      model: tile.model ?? null,
      thinkingLevel: tile.thinkingLevel ?? null,
      position: tile.position,
      size: tile.size,
    })),
  })),
});

const updateProjectList = (
  state: CanvasState,
  updater: (projects: ProjectRuntime[]) => ProjectRuntime[]
): CanvasState => {
  return { ...state, projects: updater(state.projects) };
};

const reducer = (state: CanvasState, action: Action): CanvasState => {
  switch (action.type) {
    case "loadStore": {
      const projects = action.store.projects.map(hydrateProject);
      const activeProjectId =
        action.store.activeProjectId &&
        projects.some((project) => project.id === action.store.activeProjectId)
          ? action.store.activeProjectId
          : projects[0]?.id ?? null;
      return {
        ...state,
        projects,
        activeProjectId,
        loading: false,
        error: null,
      };
    }
    case "setError":
      return { ...state, error: action.error, loading: false };
    case "setActiveProject":
      return { ...state, activeProjectId: action.projectId, selectedTileId: null };
    case "addProject":
      return updateProjectList(state, (projects) => [...projects, action.project]);
    case "removeProject":
      return updateProjectList(state, (projects) =>
        projects.filter((project) => project.id !== action.projectId)
      );
    case "updateProject":
      return updateProjectList(state, (projects) =>
        projects.map((project) =>
          project.id === action.projectId
            ? { ...project, ...action.patch, updatedAt: Date.now() }
            : project
        )
      );
    case "addTile":
      return updateProjectList(state, (projects) =>
        projects.map((project) =>
          project.id === action.projectId
            ? {
                ...project,
                tiles: [...project.tiles, action.tile],
                updatedAt: Date.now(),
              }
            : project
        )
      );
    case "removeTile":
      return updateProjectList(state, (projects) =>
        projects.map((project) =>
          project.id === action.projectId
            ? {
                ...project,
                tiles: project.tiles.filter((tile) => tile.id !== action.tileId),
                updatedAt: Date.now(),
              }
            : project
        )
      );
    case "updateTile":
      return updateProjectList(state, (projects) =>
        projects.map((project) =>
          project.id === action.projectId
            ? {
                ...project,
                tiles: project.tiles.map((tile) =>
                  tile.id === action.tileId ? { ...tile, ...action.patch } : tile
                ),
                updatedAt: Date.now(),
              }
            : project
        )
      );
    case "appendOutput":
      return updateProjectList(state, (projects) =>
        projects.map((project) =>
          project.id === action.projectId
            ? {
                ...project,
                tiles: project.tiles.map((tile) =>
                  tile.id === action.tileId
                    ? { ...tile, outputLines: [...tile.outputLines, action.line] }
                    : tile
                ),
              }
            : project
        )
      );
    case "setStream":
      return updateProjectList(state, (projects) =>
        projects.map((project) =>
          project.id === action.projectId
            ? {
                ...project,
                tiles: project.tiles.map((tile) =>
                  tile.id === action.tileId ? { ...tile, streamText: action.value } : tile
                ),
              }
            : project
        )
      );
    case "selectTile":
      return { ...state, selectedTileId: action.tileId };
    case "setCanvas":
      return { ...state, canvas: { ...state.canvas, ...action.patch } };
    default:
      return state;
  }
};

type StoreContextValue = {
  state: CanvasState;
  dispatch: React.Dispatch<Action>;
  createTile: (projectId: string) => AgentTile;
  refreshStore: () => Promise<void>;
  createProject: (name: string, repoPath: string) => Promise<{ warnings: string[] } | null>;
  deleteProject: (projectId: string) => Promise<void>;
};

const StoreContext = createContext<StoreContextValue | null>(null);

export const AgentCanvasProvider = ({ children }: { children: ReactNode }) => {
  const [state, dispatch] = useReducer(reducer, initialState);
  const lastSavedRef = useRef<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshStore = useCallback(async () => {
    try {
      const store = await fetchProjectsStore();
      dispatch({ type: "loadStore", store });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load projects.";
      dispatch({ type: "setError", error: message });
    }
  }, []);

  useEffect(() => {
    void refreshStore();
  }, [refreshStore]);

  useEffect(() => {
    if (state.loading) return;
    const payload = dehydrateStore(state);
    const serialized = JSON.stringify(payload);
    if (serialized === lastSavedRef.current) return;

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = setTimeout(() => {
      void saveProjectsStore(payload).then(() => {
        lastSavedRef.current = serialized;
      });
    }, 250);
  }, [state]);

  const createTile = useCallback((projectId: string) => {
    const id = crypto.randomUUID();
    return createRuntimeTile(projectId, {
      id,
      name: `Agent ${id.slice(0, 4)}`,
      sessionKey: buildSessionKey(projectId, id),
      model: null,
      thinkingLevel: null,
      position: { x: 80, y: 80 },
      size: { width: 360, height: 280 },
    });
  }, []);

  const createProject = useCallback(async (name: string, repoPath: string) => {
    try {
      const result = await apiCreateProject({ name, repoPath });
      dispatch({ type: "loadStore", store: result.store });
      return { warnings: result.warnings };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create project.";
      dispatch({ type: "setError", error: message });
      return null;
    }
  }, []);

  const deleteProject = useCallback(async (projectId: string) => {
    try {
      const store = await apiDeleteProject(projectId);
      dispatch({ type: "loadStore", store });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to delete project.";
      dispatch({ type: "setError", error: message });
    }
  }, []);

  const value = useMemo<StoreContextValue>(() => {
    return {
      state,
      dispatch,
      createTile,
      refreshStore,
      createProject,
      deleteProject,
    };
  }, [state, createTile, refreshStore, createProject, deleteProject]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
};

export const useAgentCanvasStore = () => {
  const ctx = useContext(StoreContext);
  if (!ctx) {
    throw new Error("AgentCanvasProvider is missing.");
  }
  return ctx;
};

export const getActiveProject = (state: CanvasState): ProjectRuntime | null => {
  return state.projects.find((project) => project.id === state.activeProjectId) ?? null;
};
