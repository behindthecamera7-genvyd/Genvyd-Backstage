import React, { useState, useMemo, useEffect, Component, ReactNode } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Camera, 
  Film, 
  Upload, 
  Copy, 
  Plus, 
  PlusCircle, 
  Trash2, 
  Search, 
  Info,
  Maximize2,
  Sparkles,
  Zap,
  Terminal,
  Layers,
  CheckCircle2,
  Users,
  MessageSquare,
  RefreshCcw,
  Lightbulb,
  FolderOpen,
  Calendar,
  ExternalLink,
  ChevronLeft,
  X,
  Edit3,
  Download,
  LayoutGrid,
  Music,
  Mic,
  FileText,
  LogOut,
  LogIn,
  User as UserIcon,
  Cloud,
  CloudOff
} from "lucide-react";
import { generateBrandReport, generateShotSequence, regenerateShotPrompt, refineAllPrompts, generateStyleSpec } from "./geminiService";
import { BrandReport, Shot, Project } from "./types";
import JSZip from "jszip";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { 
  auth, 
  db, 
  storage,
  googleProvider, 
  OperationType, 
  handleFirestoreError 
} from "./firebase";
import { 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged, 
  User 
} from "firebase/auth";
import { 
  doc, 
  setDoc, 
  getDoc, 
  updateDoc, 
  deleteDoc, 
  collection, 
  onSnapshot, 
  query, 
  where, 
  orderBy,
  serverTimestamp,
  writeBatch
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: any, errorInfo: any) {
    console.error("App Crash:", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 bg-black flex items-center justify-center p-10 text-center z-[9999]">
          <div className="max-w-md w-full space-y-8 glass-panel p-12 rounded-[3.5rem] border-brand-gold/30 shadow-[0_0_100px_rgba(255,255,255,0.05)] bg-black/80 backdrop-blur-3xl">
            <div className="relative">
              <div className="w-24 h-24 mx-auto rounded-full border-2 border-brand-gold/10 border-t-brand-gold animate-spin" />
              <Zap size={32} className="text-brand-gold absolute inset-0 m-auto animate-pulse" />
            </div>
            <div className="space-y-4">
              <h2 className="text-lg font-mono text-brand-gold uppercase tracking-[0.4em] font-black">Memory_Buffer_Conflict</h2>
              <p className="text-[10px] font-mono text-white/40 leading-relaxed uppercase tracking-[0.2em] px-4">
                The visual processing engine encountered a synchronization limit. This usually occurs when internal asset states exceed standard web-persistence thresholds.
              </p>
            </div>
            <div className="space-y-3 pt-4">
              <button 
                onClick={() => {
                  localStorage.clear();
                  window.location.reload();
                }}
                className="w-full py-4 bg-brand-gold text-black rounded-2xl font-mono text-[10px] font-black uppercase tracking-[0.3em] hover:bg-white transition-all active:scale-95 shadow-lg shadow-brand-gold/20"
              >
                Deep Reset (Clear Data)
              </button>
              <button 
                onClick={() => window.location.reload()}
                className="w-full py-4 bg-white/5 text-white/60 rounded-2xl font-mono text-[10px] font-black uppercase tracking-[0.3em] hover:bg-white/10 transition-all active:scale-95 border border-white/10"
              >
                Soft Restart
              </button>
            </div>
          </div>
        </div>
      );
    }
    return (this as any).props.children;
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppBody />
    </ErrorBoundary>
  );
}

function AppBody() {
  const [user, setUser] = useState<User | null>(null);
  const [isCloudSyncing, setIsCloudSyncing] = useState(false);
  const [syncEnabled, setSyncEnabled] = useState(true);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [cloudLimitWarning, setCloudLimitWarning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [script, setScript] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [visualTheme, setVisualTheme] = useState("");
  const [globalRefinement, setGlobalRefinement] = useState("");
  const [quickStyleDirective, setQuickStyleDirective] = useState("");
  const [showApplyPassBanner, setShowApplyPassBanner] = useState(false);
  const [generatedStyleSummary, setGeneratedStyleSummary] = useState("");
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [startPageDirective, setStartPageDirective] = useState("");
  const [startPageSpecMessage, setStartPageSpecMessage] = useState("");
  const [preSynthesizedSpec, setPreSynthesizedSpec] = useState<any>(null);
  const [view, setView] = useState<"projects" | "editor" | "gallery">("projects");
  const [editorMode, setEditorMode] = useState<"list" | "grid">("list");

  // Auth Listener
  useEffect(() => {
    let unsubFirestore: (() => void) | null = null;
    
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      
      // Clear existing firestore listener if any
      if (unsubFirestore) {
        unsubFirestore();
        unsubFirestore = null;
      }

      if (currentUser) {
        // Fetch projects from Firestore
        const q = query(
          collection(db, "projects"),
          where("userId", "==", currentUser.uid),
          orderBy("updatedAt", "desc")
        );

        unsubFirestore = onSnapshot(q, (snapshot) => {
          const fetchedProjects = snapshot.docs.map(doc => doc.data() as Project);
          setProjects(fetchedProjects);
          setIsInitializing(false);
        }, (error) => {
          console.error("Firestore sync error:", error);
          setIsInitializing(false);
        });
      } else {
        // Fallback to local storage or clear if needed
        const saved = localStorage.getItem("genvyd_projects");
        if (saved) {
          try {
            setProjects(JSON.parse(saved));
          } catch (e) {
            console.error("Local load failed", e);
          }
        }
        setIsInitializing(false);
      }
    });

    return () => {
      unsubscribe();
      if (unsubFirestore) unsubFirestore();
    };
  }, []);

  const login = async () => {
    setLoginError(null);
    setIsLoggingIn(true);
    try {
      googleProvider.setCustomParameters({ prompt: 'select_account' });
      await signInWithPopup(auth, googleProvider);
    } catch (error: any) {
      console.error("Login failed", error);
      let message = "Login failed. Please try again.";
      if (error.code === 'auth/popup-blocked') {
        message = "Popup was blocked by your browser. Please allow popups for this site.";
      } else if (error.code === 'auth/unauthorized-domain') {
        message = "This domain is not authorized in Firebase Console. Please add behindthecamera7-genvyd.github.io to authorized domains.";
      } else if (error.code === 'auth/popup-closed-by-user') {
        message = "Login window was closed before completion.";
      } else if (error.message) {
        message = error.message;
      }
      setLoginError(message);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
      setProjects([]);
      setCurrentProjectId(null);
      localStorage.removeItem("genvyd_projects");
    } catch (error) {
      console.error("Logout failed", error);
    }
  };

  const saveProjectToCloud = async (project: Project) => {
    if (!user || !syncEnabled) return;
    setIsCloudSyncing(true);
    setCloudLimitWarning(false);
    try {
      const data = {
        ...project,
        userId: user.uid,
        updatedAt: Date.now()
      };
      
      const size = new Blob([JSON.stringify(data)]).size;
      if (size > 1000 * 1024) {
        setCloudLimitWarning(true);
        console.warn("Project size exceeds 1MB. High-res images may not persist in cloud.");
      }

      const projectRef = doc(db, "projects", project.id);
      await setDoc(projectRef, data);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `projects/${project.id}`);
    } finally {
      setIsCloudSyncing(false);
    }
  };

  const toggleSync = () => {
    const newSyncState = !syncEnabled;
    setSyncEnabled(newSyncState);
    if (newSyncState && user && currentProject) {
      saveProjectToCloud(currentProject);
    }
  };

  // Handle migration of local projects to cloud on login
  useEffect(() => {
    if (user && projects.length > 0) {
      const unsynced = projects.filter(p => !p.id.includes('_synced')); // simple flag if we need it, or just try to save all
      // For now, let's just ensure if user is logged in, projects are in cloud
      // This is a bit aggressive, usually we'd ask. But for "making image save features work better", automatic sync is good.
      projects.forEach(p => {
        // Only save if it's not already in Firestore? 
        // Actually saveProjectToCloud uses setDoc which is idempotent
        saveProjectToCloud(p);
      });
    }
  }, [user]);
  useEffect(() => {
    const handleGlobalKeydown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelectedImage(null);
        if (loading) {
          setLoading(false);
          setLoadingMessage("");
        }
      }
    };
    window.addEventListener("keydown", handleGlobalKeydown);
    return () => window.removeEventListener("keydown", handleGlobalKeydown);
  }, [loading]);

  // Loading timeout safety
  useEffect(() => {
    if (loading) {
      const timer = setTimeout(() => {
        setLoading(false);
        setLoadingMessage("");
      }, 30000); // 30s bailout
      return () => clearTimeout(timer);
    }
  }, [loading]);

  useEffect(() => {
    const saved = localStorage.getItem("genvyd_projects");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (!Array.isArray(parsed)) return;

        // Migration: Ensure all shots have versions and selectedVersionId, and projects have websiteUrl
        const migrated = parsed.map((p: any) => ({
          ...p,
          websiteUrl: p.websiteUrl || p.urlOrTheme || "",
          visualTheme: p.visualTheme || "",
          brandReport: p.brandReport ? {
            mission: p.brandReport.mission || "",
            narrativeAnchor: p.brandReport.narrativeAnchor || "",
            motifs: Array.isArray(p.brandReport.motifs) ? p.brandReport.motifs : [],
            targetSoftware: p.brandReport.targetSoftware || "Midjourney v6",
            characterDescription: p.brandReport.characterDescription || "",
            characters: Array.isArray(p.brandReport.characters) ? p.brandReport.characters : [],
            cinematicProfile: {
              lighting: p.brandReport.cinematicProfile?.lighting || "",
              palette: p.brandReport.cinematicProfile?.palette || "",
              lens: p.brandReport.cinematicProfile?.lens || ""
            }
          } : null,
          shots: (p.shots || []).map((s: any) => {
            const versionId = Math.random().toString(36).substr(2, 9);
            const versions = Array.isArray(s.versions) ? s.versions : [];
            return {
              isCharacterShot: s.isCharacterShot || false,
              requiresFaceSwap: s.requiresFaceSwap || false,
              ...s,
              versions: versions.length > 0 ? versions : [{
                id: versionId,
                imagePrompt: s.imagePrompt || "",
                motionPrompt: s.motionPrompt || "",
                timestamp: Date.now(),
                imagePreview: s.imagePreview
              }],
              selectedVersionId: s.selectedVersionId || (versions[0]?.id) || versionId
            };
          })
        }));
        setProjects(migrated);
      } catch (e) {
        console.error("Failed to load or migrate projects", e);
      }
    }
  }, []);

  useEffect(() => {
    if (projects.length > 0) {
      try {
        localStorage.setItem("genvyd_projects", JSON.stringify(projects));
      } catch (e) {
        console.warn("Project sync failed: LocalStorage may be full. Images may not persist.", e);
      }
    }
  }, [projects]);

  const currentProject = useMemo(() => 
    projects.find(p => p.id === currentProjectId) || null
  , [projects, currentProjectId]);

  const brandReport = currentProject?.brandReport || null;
  const shots = currentProject?.shots || [];

  const createProject = () => {
    const newProject: Project = {
      id: Math.random().toString(36).substring(2, 11),
      name: "New Production",
      script: "",
      websiteUrl: "",
      visualTheme: "",
      brandReport: null,
      shots: [],
      updatedAt: Date.now()
    };
    const updatedProjects = [newProject, ...projects];
    setProjects(updatedProjects);
    if (user) saveProjectToCloud(newProject);
    setCurrentProjectId(newProject.id);
    setScript("");
    setWebsiteUrl("");
    setVisualTheme("");
    setView("editor");
  };

  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmDeleteShotId, setConfirmDeleteShotId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const deleteProject = async (id: string) => {
    setProjects(prev => prev.filter(p => p.id !== id));
    if (user) {
      try {
        await deleteDoc(doc(db, "projects", id));
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `projects/${id}`);
      }
    }
    if (currentProjectId === id) {
      setCurrentProjectId(null);
      setView("projects");
    }
    setConfirmDeleteId(null);
  };

  const renameProject = (id: string, newName: string) => {
    const updatedProjects = projects.map(p => 
      p.id === id ? { ...p, name: newName, updatedAt: Date.now() } : p
    );
    setProjects(updatedProjects);
    
    if (user) {
      const p = updatedProjects.find(p => p.id === id);
      if (p) saveProjectToCloud(p);
    }
  };

  const handleRenameSubmit = (id: string) => {
    if (editName.trim()) {
      renameProject(id, editName.trim());
    }
    setEditingProjectId(null);
  };

  // Helper to update current project fields
  const updateCurrentProject = (updates: Partial<Project>) => {
    if (!currentProjectId) return;
    const updatedProjects = projects.map(p => 
      p.id === currentProjectId ? { ...p, ...updates, updatedAt: Date.now() } : p
    );
    setProjects(updatedProjects);
    
    if (user) {
      const p = updatedProjects.find(p => p.id === currentProjectId);
      if (p) saveProjectToCloud(p);
    }
  };

  const setBrandReportSync = (report: BrandReport | null) => updateCurrentProject({ brandReport: report });
  const setShotsSync = (newShots: Shot[]) => updateCurrentProject({ shots: newShots });

  const handleResearchAndSequence = async () => {
    if (!script) return;
    setLoading(true);
    setLoadingMessage("Analyzing script and brand data...");
    try {
      let researchData = "";
      if (websiteUrl && websiteUrl.startsWith("http")) {
        setLoadingMessage("Analyzing website URL for visual references...");
        try {
          const res = await fetch(`/api/research?url=${encodeURIComponent(websiteUrl)}`);
          if (res.ok) {
            const data = await res.json();
            researchData = data.summary;
          }
        } catch (e) {
          console.warn("URL analysis failed", e);
        }
      }

      setLoadingMessage("Synthesizing creative brand profile...");
      const rawReport = await generateBrandReport(script, websiteUrl, visualTheme, researchData);
      const report: BrandReport = {
        mission: rawReport.mission || "",
        narrativeAnchor: rawReport.narrativeAnchor || "",
        motifs: (preSynthesizedSpec?.motifs && preSynthesizedSpec.motifs.length > 0)
          ? preSynthesizedSpec.motifs
          : (Array.isArray(rawReport.motifs) ? rawReport.motifs : []),
        targetSoftware: preSynthesizedSpec?.targetSoftware || rawReport.targetSoftware || "Midjourney v6",
        characterDescription: preSynthesizedSpec?.characterDescription || rawReport.characterDescription || "",
        characters: preSynthesizedSpec?.characters || (rawReport as any).characters || [],
        cinematicProfile: {
          lighting: preSynthesizedSpec?.cinematicProfile?.lighting || rawReport.cinematicProfile?.lighting || "",
          palette: preSynthesizedSpec?.cinematicProfile?.palette || rawReport.cinematicProfile?.palette || "",
          lens: preSynthesizedSpec?.cinematicProfile?.lens || rawReport.cinematicProfile?.lens || ""
        }
      };
      
      setLoadingMessage("Generating visual shot sequence...");
      const rawSequence = await generateShotSequence(script, report);
      
      const sequence: Shot[] = rawSequence.map((s: any) => {
        if (s.versions && s.selectedVersionId) return s as Shot;
        
        const versionId = Math.random().toString(36).substr(2, 9);
        return {
          ...s,
          versions: [{
            id: versionId,
            imagePrompt: s.imagePrompt || "",
            motionPrompt: s.motionPrompt || "",
            timestamp: Date.now()
          }],
          selectedVersionId: versionId
        };
      });
      
      updateCurrentProject({ 
        brandReport: report, 
        shots: sequence,
        script: script,
        websiteUrl: websiteUrl,
        visualTheme: visualTheme,
        name: (report.mission || "New Production").slice(0, 40) + "..."
      });
      
      // Force an immediate save to local storage and sync
      const saved = localStorage.getItem("genvyd_projects");
      const currentProjects = saved ? JSON.parse(saved) : projects;
      const updated = currentProjects.map((p: any) => p.id === currentProjectId ? {
        ...p,
        brandReport: report,
        shots: sequence,
        script,
        websiteUrl,
        visualTheme,
        updatedAt: Date.now()
      } : p);
      localStorage.setItem("genvyd_projects", JSON.stringify(updated));
      
      // If synced, also trigger the cloud save for the newly synthesized data
      const proj = updated.find((p: any) => p.id === currentProjectId);
      if (proj && user && syncEnabled) {
        saveProjectToCloud(proj);
      }
    } catch (error) {
      console.error("Synthesis failed", error);
      alert("Synthesis failed. Please check the console for details or try a different prompt.");
    } finally {
      setLoading(false);
      setLoadingMessage("");
    }
  };

  const handleRegenerate = async (shot: Shot) => {
    if (!brandReport) return;
    setLoading(true);
    setLoadingMessage(`Re-imagining Shot ${shot.index}...`);
    try {
      const ideas = prompt("Any specific direction for this regeneration? (e.g., 'Make it rain colder', 'More neon')");
      const { image, motion } = await regenerateShotPrompt(shot, brandReport, ideas || undefined);
      
      const newVersionId = Math.random().toString(36).substr(2, 9);
      const newVersion = {
        id: newVersionId,
        imagePrompt: image,
        motionPrompt: motion,
        timestamp: Date.now()
      };

      updateShot(shot.id, { 
        versions: [...shot.versions, newVersion],
        selectedVersionId: newVersionId
      });
    } catch (error) {
      console.error("Regeneration failed", error);
    } finally {
      setLoading(false);
      setLoadingMessage("");
    }
  };

  const selectVersion = (shotId: string, versionId: string) => {
    updateShot(shotId, { selectedVersionId: versionId });
  };

  const toggleFavoriteVersion = (shotId: string, versionId: string) => {
    const shot = shots.find(s => s.id === shotId);
    if (!shot) return;
    
    let isNowFavorite = false;
    const newVersions = shot.versions.map(v => {
      if (v.id === versionId) {
        isNowFavorite = !v.isFavorite;
        return { ...v, isFavorite: isNowFavorite };
      }
      return v;
    });

    const updates: Partial<Shot> = { versions: newVersions };
    if (isNowFavorite) {
      updates.selectedVersionId = versionId;
    }
    
    updateShot(shotId, updates);
  };

  const updateShot = (id: string, updates: Partial<Shot>) => {
    setShotsSync(shots.map(s => s.id === id ? { ...s, ...updates } : s));
  };

  const removeShot = (id: string) => {
    setShotsSync(shots.filter(s => s.id !== id));
    setConfirmDeleteShotId(null);
  };

  const addShotAfter = (shotId: string) => {
    const index = shots.findIndex(s => s.id === shotId);
    if (index === -1) return;

    const baseShot = shots[index];
    const newId = Math.random().toString(36).substr(2, 9);
    
    // Suggest a sub-shot index (e.g., if 1, suggest 1b)
    const lastChar = baseShot.index.slice(-1);
    let nextIndex = baseShot.index;
    if (/\d/.test(lastChar)) {
      nextIndex = baseShot.index + "b";
    } else {
      const charCode = lastChar.charCodeAt(0);
      nextIndex = baseShot.index.slice(0, -1) + String.fromCharCode(charCode + 1);
    }

    const newShot: Shot = {
      id: newId,
      index: nextIndex,
      title: `${baseShot.title} (Cont.)`,
      type: baseShot.type,
      context: baseShot.context || "Transition",
      notes: "",
      versions: [
        {
          id: Math.random().toString(36).substr(2, 9),
          imagePrompt: "(New Shot Prompt)",
          motionPrompt: "(New Motion Prompt)",
          timestamp: Date.now()
        }
      ],
      selectedVersionId: "", 
    };
    newShot.selectedVersionId = newShot.versions[0].id;

    const newShots = [...shots];
    newShots.splice(index + 1, 0, newShot);
    setShotsSync(newShots);
  };

  const moveShot = (id: string, direction: 'up' | 'down') => {
    const index = shots.findIndex(s => s.id === id);
    if (index < 0) return;
    
    const newShots = [...shots];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    
    if (targetIndex < 0 || targetIndex >= newShots.length) return;
    
    [newShots[index], newShots[targetIndex]] = [newShots[targetIndex], newShots[index]];
    setShotsSync(newShots);
  };

  const handleGlobalRefinement = async (directiveOverride?: string) => {
    const directive = typeof directiveOverride === 'string' ? directiveOverride : globalRefinement;
    if (!directive || !currentProject || !brandReport) return;
    setLoading(true);
    setLoadingMessage("Synthesizing creative direction...");
    try {
      const refinements = await refineAllPrompts(shots, brandReport, directive);
      
      if (!refinements || refinements.length === 0) {
        console.warn("No refinements returned from AI.");
        setLoadingMessage("No refinements generated...");
        setTimeout(() => setLoading(false), 1000);
        return;
      }

      let updateCount = 0;
      setLoadingMessage(`Applying new style pass to ${shots.length} shots...`);
      const updatedShots = shots.map(shot => {
        const refinement = refinements.find(r => String(r.shotId) === String(shot.id));
        if (refinement) {
          updateCount++;
          const newVersionId = Math.random().toString(36).substr(2, 9);
          const newVersion = {
            id: newVersionId,
            imagePrompt: refinement.imagePrompt,
            motionPrompt: refinement.motionPrompt,
            timestamp: Date.now(),
            imagePreview: (shot.versions || []).find(v => v.id === shot.selectedVersionId)?.imagePreview
          };
          return {
            ...shot,
            versions: [...shot.versions, newVersion],
            selectedVersionId: newVersionId
          };
        }
        return shot;
      });

      if (updateCount === 0) {
        console.warn("Match failed for all refinements. Check IDs.");
      }

      updateCurrentProject({ shots: updatedShots });
      setGlobalRefinement("");
    } catch (error) {
      console.error("Global refinement failed:", error);
    } finally {
      setLoading(false);
      setLoadingMessage("");
    }
  };

  const handleQuickStyleGenerate = async () => {
    if (!quickStyleDirective || !currentProject || !brandReport) return;
    setLoading(true);
    setLoadingMessage("Synthesizing vibe and aesthetic specifications...");
    setShowApplyPassBanner(false);
    try {
      const spec = await generateStyleSpec(quickStyleDirective, currentProject.script);
      
      const updatedReport: BrandReport = {
        ...brandReport,
        targetSoftware: spec.targetSoftware || brandReport.targetSoftware || "Midjourney v6",
        motifs: spec.motifs && spec.motifs.length > 0 ? spec.motifs : brandReport.motifs,
        cinematicProfile: {
          lighting: spec.cinematicProfile?.lighting || brandReport.cinematicProfile?.lighting || "",
          palette: spec.cinematicProfile?.palette || brandReport.cinematicProfile?.palette || "",
          lens: spec.cinematicProfile?.lens || brandReport.cinematicProfile?.lens || ""
        }
      };
      
      if (spec.characterDescription && !brandReport.characterDescription) {
        updatedReport.characterDescription = spec.characterDescription;
      }
      
      updateCurrentProject({ brandReport: updatedReport });
      setGeneratedStyleSummary(`Lighting: ${spec.cinematicProfile?.lighting || ""} | Atmosphere: ${spec.cinematicProfile?.palette || ""} | Elements: ${(spec.motifs || []).join(", ")}`);
      setShowApplyPassBanner(true);
    } catch (error) {
      console.error("Failed to generate style specs:", error);
    } finally {
      setLoading(false);
      setLoadingMessage("");
    }
  };

  const handleStartPageQuickStyleGenerate = async (directiveOverride?: string) => {
    const directive = directiveOverride || startPageDirective;
    if (!directive) return;
    setLoading(true);
    setLoadingMessage("Synthesizing aesthetic layer and brand specs from style directive...");
    setStartPageSpecMessage("");
    try {
      const spec = await generateStyleSpec(directive, script);
      setPreSynthesizedSpec(spec);
      
      const details = `${directive}. Lighting: ${spec.cinematicProfile?.lighting || "Bright high-key keylight"} | Atmosphere: ${spec.cinematicProfile?.palette || "Clean modern tones"} | Lens: ${spec.cinematicProfile?.lens || "35mm prime"}`;
      setVisualTheme(details);
      setStartPageSpecMessage(`Aesthetic specs pre-configured successfully! Lighting: ${spec.cinematicProfile?.lighting || "Natural"}, Elements: ${(spec.motifs || []).join(", ") || "Office setups"}`);
    } catch (error) {
      console.error("Failed to pre-synthesize specs:", error);
      setVisualTheme(directive);
    } finally {
      setLoading(false);
      setLoadingMessage("");
    }
  };

  const printStoryboard = async () => {
    if (view === "gallery") {
      window.print();
      return;
    }

    setLoading(true);
    setLoadingMessage("Synthesizing Visual Production Deck...");

    try {
      // Small cooldown to ensure UI transitions are settled
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const storyboard = document.getElementById('storyboard-container');
      
      if (!storyboard) {
        console.warn("Storyboard container not found, falling back to window.print()");
        window.print();
        return;
      }

      // Clone or temporary style to ensure it's captured correctly
      const canvas = await html2canvas(storyboard, {
        scale: 1.5,
        useCORS: true,
        backgroundColor: '#0a0a0a',
        logging: false,
        windowWidth: 1400, // Normalized viewport width for capture
        onclone: (doc) => {
          const el = doc.getElementById('storyboard-container');
          if (el) el.style.padding = '40px';
        }
      });

      const imgData = canvas.toDataURL('image/jpeg', 0.9);
      const doc = new jsPDF('p', 'mm', 'a4');
      
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      
      const imgWidth = pageWidth;
      const imgHeight = (canvas.height * pageWidth) / canvas.width;
      
      let heightLeft = imgHeight;
      let position = 0;

      doc.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;

      while (heightLeft >= 0) {
        position = heightLeft - imgHeight;
        doc.addPage();
        doc.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      doc.save(`${currentProject?.name || 'Storyboard'}_Production_Deck.pdf`);
    } catch (err) {
      console.error("Advanced PDF generation failed, falling back to browser print:", err);
      window.print();
    } finally {
      setLoading(false);
      setLoadingMessage("");
    }
  };

  const handleFileUpload = async (shotId: string, file: File) => {
    if (file.size > 10 * 1024 * 1024) {
      alert("File is too large (max 10MB for stability).");
      return;
    }

    setLoading(true);
    setLoadingMessage("Uploading visual asset...");

    try {
      let previewUrl = "";
      
      if (user && syncEnabled) {
        // Upload to Firebase Storage
        const fileRef = ref(storage, `users/${user.uid}/projects/${currentProjectId}/shots/${shotId}/${Date.now()}_${file.name}`);
        const snapshot = await uploadBytes(fileRef, file);
        previewUrl = await getDownloadURL(snapshot.ref);
      } else {
        // Fallback to local Base64
        previewUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target?.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      }

      const shot = shots.find(s => s.id === shotId);
      if (!shot) return;

      const newVersions = shot.versions.map(v => 
        v.id === shot.selectedVersionId ? { ...v, imagePreview: previewUrl } : v
      );
      updateShot(shotId, { versions: newVersions });
    } catch (err) {
      console.error("File processing failed:", err);
      alert("Failed to upload/process file. See console for details.");
    } finally {
      setLoading(false);
      setLoadingMessage("");
    }
  };

  const handleAudioUpload = async (shotId: string, file: File) => {
    setLoading(true);
    setLoadingMessage("Uploading audio asset...");
    
    try {
      let audioUrl = "";
      
      if (user && syncEnabled) {
        const fileRef = ref(storage, `users/${user.uid}/projects/${currentProjectId}/shots/${shotId}/audio_${Date.now()}_${file.name}`);
        const snapshot = await uploadBytes(fileRef, file);
        audioUrl = await getDownloadURL(snapshot.ref);
      } else {
        audioUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target?.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      }

      const shot = shots.find(s => s.id === shotId);
      if (!shot) return;

      const newVersions = shot.versions.map(v => 
        v.id === shot.selectedVersionId ? { ...v, audioPreview: audioUrl } : v
      );
      updateShot(shotId, { versions: newVersions });
    } catch (err) {
      console.error("Audio upload failed:", err);
    } finally {
      setLoading(false);
      setLoadingMessage("");
    }
  };

  const exportDirectorsPack = async () => {
    if (!currentProject) return;
    setLoading(true);
    setLoadingMessage("Preparing Director's Pack Assets...");
    
    try {
      const zip = new JSZip();
      const excelData: any[] = [];
      const imagesFolder = zip.folder("images");
      const audioFolder = zip.folder("audio");

      currentProject.shots.forEach((shot, index) => {
        setLoadingMessage(`Zipping Assets: ${index + 1} / ${currentProject.shots.length}`);
        const activeVersion = shot.versions.find(v => v.id === shot.selectedVersionId) || shot.versions[0];
        const shotIdStr = `shot_${shot.index.replace(/[^a-zA-Z0-9]/g, '_')}`;
        
        let imageFilename = "";
        if (activeVersion?.imagePreview) {
          try {
            const extension = activeVersion.imagePreview.split(';')[0].split('/')[1]?.split('+')[0] || 'png';
            imageFilename = `${shotIdStr}.${extension}`;
            const base64Data = activeVersion.imagePreview.split(',')[1];
            imagesFolder?.file(imageFilename, base64Data, { base64: true });
          } catch (e) {
            console.error("Failed to add image to zip", e);
          }
        }

        let audioFilename = "";
        if (activeVersion?.audioPreview) {
          try {
            const mimePart = activeVersion.audioPreview.split(';')[0];
            const extension = mimePart.includes('/') ? mimePart.split('/')[1]?.split('+')[0] : 'mp3';
            audioFilename = `${shotIdStr}.${extension}`;
            const base64Data = activeVersion.audioPreview.split(',')[1];
            audioFolder?.file(audioFilename, base64Data, { base64: true });
          } catch (e) {
            console.error("Failed to add audio to zip", e);
          }
        }

        const beatMatch = shot.index.match(/^\d+/);
        const beat = beatMatch ? beatMatch[0] : "custom";

        excelData.push({
          "Shot #": shot.index,
          "Title": shot.title,
          "Type": shot.type,
          "Beat": beat,
          "VO / Dialogue": shot.dialogue || "",
          "Character Shot": shot.isCharacterShot ? "YES" : "NO",
          "Face Swap Req": shot.requiresFaceSwap ? "YES" : "NO",
          "Image Prompt": activeVersion?.imagePrompt || "",
          "Motion Prompt": activeVersion?.motionPrompt || "",
          "Image File": imageFilename ? `images/${imageFilename}` : "",
          "Audio File": audioFilename ? `audio/${audioFilename}` : "",
          "Director Notes": shot.notes || ""
        });
      });

      // Create Excel Workbook
      const ws = XLSX.utils.json_to_sheet(excelData);
      
      // Auto-size columns Roughly
      const colWidths = excelData.length > 0 ? Object.keys(excelData[0]).map(key => ({ wch: Math.max(key.length, 15) })) : [];
      ws['!cols'] = colWidths;

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Shot List");
      const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      zip.file("shot_list.xlsx", excelBuffer);

      // Generate ZIP
      const content = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(content);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${currentProject.name.replace(/\s+/g, '_')}_DIRECTORS_PACK.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Export failed:", err);
      alert("Export failed. Please check your data and try again.");
    } finally {
      setLoading(false);
      setLoadingMessage("");
    }
  };

  const exportProject = () => {
    if (!currentProject) return;
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(currentProject, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href",     dataStr);
    downloadAnchorNode.setAttribute("download", `${currentProject.name.replace(/\s+/g, '_')}_storyboard.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  // Group shots by beat for the sub-shot architecture rendering
  const groupedShots = useMemo(() => {
    const groups: { [key: string]: Shot[] } = {};
    const filteredShots = showFavoritesOnly 
      ? shots.filter(s => s.versions.some(v => v.id === s.selectedVersionId && v.isFavorite))
      : shots;

    filteredShots.forEach(shot => {
      const beatMatch = shot.index.match(/^\d+/);
      const beat = beatMatch ? beatMatch[0] : "custom";
      if (!groups[beat]) groups[beat] = [];
      groups[beat].push(shot);
    });
    return groups;
  }, [shots, showFavoritesOnly]);

  if (view === "projects") {
    return (
      <div className="min-h-screen bg-brand-ink text-white p-8 cinematic-grid">
        <div className="max-w-6xl mx-auto space-y-12">
          <div className="flex items-center justify-between">
            <h1 className="text-4xl font-display tracking-tight text-white">
              Genvyd <span className="text-brand-red">Backstage</span>
            </h1>
            <div className="flex items-center gap-4">
              <button 
                onClick={createProject}
                className="bg-white text-black font-bold px-6 py-3 rounded-xl flex items-center gap-2 hover:bg-brand-gold transition-all"
              >
                <Plus size={20} />
                <span>New Production</span>
              </button>
              
              <div className="h-8 w-px bg-white/10 mx-2" />

              {user ? (
                <div className="flex items-center gap-3">
                  <div className="flex flex-col items-end">
                    <span className="text-[10px] font-mono text-white/80 uppercase tracking-widest">{user.displayName}</span>
                    <div className="flex items-center gap-1">
                      {isCloudSyncing ? (
                        <RefreshCcw size={10} className="text-brand-cyan animate-spin" />
                      ) : !syncEnabled ? (
                        <div className="flex items-center gap-1 cursor-pointer" onClick={toggleSync} title="Sync Disabled">
                          <CloudOff size={10} className="text-white/20" />
                          <span className="text-[8px] font-mono text-white/20 uppercase">Offline</span>
                        </div>
                      ) : cloudLimitWarning ? (
                        <div className="flex items-center gap-1" title="Dataset too large for cloud sync">
                          <CloudOff size={10} className="text-red-400" />
                          <span className="text-[8px] font-mono text-red-400/60 uppercase">Local Only</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 cursor-pointer" onClick={toggleSync} title="Click to disable sync">
                          <Cloud size={10} className="text-brand-cyan" />
                          <span className="text-[8px] font-mono text-white/30 uppercase">Vault Active</span>
                        </div>
                      )}
                    </div>
                  </div>
                  {user.photoURL ? (
                    <img src={user.photoURL} className="w-10 h-10 rounded-full border border-brand-gold/20 shadow-xl" alt={user.displayName || "User"} />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-brand-gold/10 flex items-center justify-center border border-brand-gold/20">
                      <UserIcon size={20} className="text-brand-gold" />
                    </div>
                  )}
                  <button 
                    onClick={logout}
                    className="text-white/20 hover:text-red-500 transition-all p-2"
                    title="Sign Out"
                  >
                    <LogOut size={20} />
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-end gap-2">
                  <button 
                    onClick={login}
                    disabled={isLoggingIn}
                    className="flex items-center gap-2 px-6 py-3 bg-brand-gold/10 text-brand-gold border border-brand-gold/20 rounded-xl text-xs uppercase font-mono tracking-widest font-black transition-all hover:bg-brand-gold hover:text-black disabled:opacity-50"
                  >
                    {isLoggingIn ? <RefreshCcw size={18} className="animate-spin" /> : <LogIn size={18} />}
                    {isLoggingIn ? "Signing In..." : "Sign In"}
                  </button>
                  {loginError && (
                    <span className="text-[9px] text-red-500 font-mono uppercase tracking-tighter">
                      Error: {loginError}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {projects.map(project => (
              <motion.div 
                key={project.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                onClick={() => {
                  setCurrentProjectId(project.id);
                  setScript(project.script);
                  setWebsiteUrl(project.websiteUrl || "");
                  setVisualTheme(project.visualTheme || "");
                  setView("editor");
                }}
                className="glass-panel p-6 rounded-2xl cursor-pointer hover:border-brand-gold/30 transition-all group relative border border-white/5"
              >
                <div className="flex justify-between items-start mb-4">
                  <div className="bg-brand-gold/10 p-3 rounded-xl">
                    <Film className="text-brand-gold" size={24} />
                  </div>
                  <div className="flex gap-2">
                    {confirmDeleteId === project.id ? (
                      <div className="flex items-center gap-1 bg-red-500/20 rounded-lg p-1 animate-pulse">
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteProject(project.id);
                          }}
                          className="text-[10px] uppercase font-mono font-bold text-red-500 px-2"
                        >
                          Confirm
                        </button>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmDeleteId(null);
                          }}
                          className="text-[10px] uppercase font-mono font-bold text-white/40 px-2"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditName(project.name);
                            setEditingProjectId(project.id);
                          }}
                          className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-brand-gold transition-all p-2"
                          title="Rename Project"
                        >
                          <Edit3 size={14} />
                        </button>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmDeleteId(project.id);
                          }}
                          className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-500 transition-all p-2"
                        >
                          <Trash2 size={16} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
                {editingProjectId === project.id ? (
                  <div className="flex flex-col gap-2 mb-2" onClick={(e) => e.stopPropagation()}>
                    <input 
                      autoFocus
                      className="bg-black/60 border border-brand-gold/40 rounded-lg px-3 py-2 text-sm text-white focus:outline-none"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleRenameSubmit(project.id);
                        if (e.key === 'Escape') setEditingProjectId(null);
                      }}
                    />
                    <div className="flex gap-2">
                       <button 
                         onClick={() => handleRenameSubmit(project.id)}
                         className="text-[10px] uppercase font-mono text-brand-gold font-bold"
                       >
                         Save
                       </button>
                       <button 
                         onClick={() => setEditingProjectId(null)}
                         className="text-[10px] uppercase font-mono text-white/40 font-bold"
                       >
                         Cancel
                       </button>
                    </div>
                  </div>
                ) : (
                  <h3 className="text-xl font-display mb-2 group-hover:text-brand-gold transition-colors truncate">
                    {project.name}
                  </h3>
                )}
                <div className="flex items-center gap-2 text-xs text-white/40 font-mono uppercase tracking-widest">
                  <Calendar size={12} />
                  {new Date(project.updatedAt).toLocaleDateString()}
                </div>
                {project.brandReport && (
                  <div className="mt-4 pt-4 border-t border-white/5 flex items-center gap-2">
                    <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
                    <span className="text-[10px] uppercase font-mono tracking-widest text-white/40">Ready for Production</span>
                  </div>
                )}
              </motion.div>
            ))}
            
            {projects.length === 0 && !isInitializing && (
              <div className="col-span-full py-20 text-center border-2 border-dashed border-white/5 rounded-3xl">
                <FolderOpen className="mx-auto mb-4 text-white/5" size={48} />
                <p className="text-white/40 font-mono text-sm uppercase tracking-widest">No production archives found</p>
                <button onClick={createProject} className="mt-4 text-brand-gold hover:underline font-mono text-xs uppercase tracking-widest">Start First Production</button>
              </div>
            )}

            {isInitializing && (
              <div className="col-span-full py-40 flex flex-col items-center justify-center space-y-4">
                <RefreshCcw className="text-brand-gold animate-spin" size={32} />
                <span className="text-[10px] font-mono uppercase tracking-[0.4em] text-white/20">Accessing Genvyd Archives...</span>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (!brandReport) {
    return (
      <div className="min-h-screen cinematic-grid flex flex-col items-center justify-center p-6 bg-brand-ink text-white">
        <div className="absolute top-8 left-8 flex items-center gap-6 no-print">
          <button 
            onClick={() => setView("projects")}
            className="flex items-center gap-2 text-white/40 font-mono text-[10px] tracking-widest"
          >
            <ChevronLeft size={16} /> Back to Library
          </button>
        </div>

        <div className="absolute top-8 right-8 no-print">
          {user ? (
            <div className="flex items-center gap-3">
              <div className="flex flex-col items-end">
                <span className="text-[10px] font-mono text-white/80 uppercase tracking-widest">{user.displayName}</span>
                <div className="flex items-center gap-1">
                  {isCloudSyncing ? (
                    <RefreshCcw size={10} className="text-brand-cyan animate-spin" />
                  ) : !syncEnabled ? (
                    <div className="flex items-center gap-1 cursor-pointer" onClick={toggleSync} title="Sync Disabled">
                      <CloudOff size={10} className="text-white/20" />
                      <span className="text-[8px] font-mono text-white/20 uppercase">Offline</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 cursor-pointer" onClick={toggleSync} title="Sync Enabled">
                      <Cloud size={10} className="text-brand-cyan" />
                      <span className="text-[8px] font-mono text-white/30 uppercase">Vault Active</span>
                    </div>
                  )}
                </div>
              </div>
              {user.photoURL ? (
                <img src={user.photoURL} className="w-10 h-10 rounded-full border border-brand-gold/20 shadow-xl" alt={user.displayName || "User"} />
              ) : (
                <div className="w-10 h-10 rounded-full bg-brand-gold/10 flex items-center justify-center border border-brand-gold/20">
                  <UserIcon size={20} className="text-brand-gold" />
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4 w-full">
              <button 
                onClick={login}
                disabled={isLoggingIn}
                className="flex items-center gap-2 px-6 py-3 bg-brand-gold/10 text-brand-gold border border-brand-gold/20 rounded-xl text-xs uppercase font-mono tracking-widest font-black transition-all hover:bg-brand-gold hover:text-black disabled:opacity-50"
              >
                {isLoggingIn ? <RefreshCcw size={18} className="animate-spin" /> : <LogIn size={18} />}
                {isLoggingIn ? "Signing In..." : "Sign In"}
              </button>
              {loginError && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-500 text-[10px] font-mono tracking-widest uppercase">
                  {loginError}
                </div>
              )}
            </div>
          )}
        </div>

        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-3xl w-full space-y-10 glass-panel p-10 rounded-3xl shadow-[0_0_100px_rgba(255,255,255,0.05)] border-brand-gold/10"
        >
          <div className="text-center space-y-4">
            <motion.div
              initial={{ rotateY: 90 }}
              animate={{ rotateY: 0 }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className="inline-block"
            >
              <h1 className="text-6xl font-display tracking-tighter text-white">
                Storyboard <span className="text-brand-gold">Laboratory</span>
              </h1>
            </motion.div>
            <p className="text-brand-gold font-mono tracking-[0.4em] uppercase text-[10px] opacity-60">
              Brand & Visual Intelligence
            </p>
          </div>

          {/* Start Page Quick Style Assistant */}
          <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-6 space-y-3 relative overflow-hidden">
            <div className="flex items-center gap-2 text-brand-gold">
              <Sparkles size={16} className="animate-pulse" />
              <span className="text-[10px] uppercase font-mono font-black tracking-wider text-white">
                💡 AI Aesthetic Style Synthesizer
              </span>
            </div>
            <p className="text-[10px] text-white/40 font-mono uppercase tracking-widest leading-normal">
              Type a simple style concept below to automatically pre-configure lens, lighting, motifs, and camera gear.
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="e.g. corporate style and bright, moody amber retro neon, high-key warm photography..."
                className="flex-1 bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-xs font-mono text-white placeholder:text-white/20 focus:outline-none focus:border-brand-gold/40"
                value={startPageDirective}
                onChange={(e) => setStartPageDirective(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleStartPageQuickStyleGenerate()}
              />
              <button
                type="button"
                onClick={() => handleStartPageQuickStyleGenerate()}
                disabled={loading || !startPageDirective}
                className="bg-brand-gold text-black font-black text-[9.5px] uppercase tracking-widest px-5 py-3 rounded-xl hover:bg-white transition-all disabled:opacity-30 whitespace-nowrap active:scale-95 animate-pulse-glow"
              >
                Synthesize Vibe
              </button>
            </div>
            {startPageSpecMessage && (
              <p className="text-[10px] text-brand-cyan font-mono italic">
                ✓ {startPageSpecMessage}
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2 mb-1 px-1">
                <Terminal size={14} className="text-brand-gold" />
                <label className="text-[10px] uppercase tracking-widest text-gray-500 font-mono">Brand Website (Optional)</label>
              </div>
              <input 
                type="text"
                placeholder="Enter URL here"
                className="w-full bg-black/60 border border-white/5 rounded-xl p-4 text-sm font-mono focus:outline-none focus:border-brand-gold/40 transition-all shadow-inner"
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
              />
            </div>
            <div className="space-y-3">
              <div className="flex items-center gap-2 px-1">
                <Camera size={14} className="text-brand-gold" />
                <label className="text-[10px] uppercase tracking-widest text-white/40 font-mono">Vibe / Aesthetic Style (Optional)</label>
              </div>
              <textarea 
                placeholder="Enter a custom style (e.g. corporate style and bright) or select a preset chip below..."
                rows={1}
                className="w-full bg-black/60 border border-white/5 rounded-xl p-4 text-sm font-mono focus:outline-none focus:border-brand-gold/40 transition-all shadow-inner resize-none min-h-[56px] text-white/80"
                value={visualTheme}
                onChange={(e) => setVisualTheme(e.target.value)}
              />
              <div className="flex flex-wrap gap-2 pt-1">
                {[
                  { label: "🏢 Corporate & Bright", value: "clean corporate style, bright natural light, warm professional glass/wood aesthetics" },
                  { label: "🌆 Moody Cyberpunk", value: "gritty cyberpunk, dark neon, rain-slicked asphalt, anamorphic blue lens flares" },
                  { label: "☀️ Warm Film", value: "nostalgic warm golden-hour film grain, organic 35mm primes, sun-drenched halos" },
                  { label: "🎥 Gritty Noir", value: "high-contrast cinematic chiaroscuro, harsh dramatic key lighting, monochrome shadows" }
                ].map(preset => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => setVisualTheme(preset.value)}
                    className={`text-[9px] font-mono px-3 py-1.5 rounded-full border transition-all active:scale-95 ${
                      visualTheme === preset.value
                        ? 'bg-brand-gold border-brand-gold text-black font-black'
                        : 'bg-white/5 border-white/5 text-white/60 hover:border-white/10 hover:bg-white/10'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2 mb-1 px-1">
                <Layers size={14} className="text-brand-gold" />
                <label className="text-[10px] uppercase tracking-widest text-gray-500 font-mono">Narrative Protocol (The Script)</label>
              </div>
              <textarea 
                placeholder="Paste the script or core narrative beats that define this production..."
                rows={10}
                className="w-full bg-black/60 border border-white/5 rounded-xl p-4 text-sm font-sans leading-relaxed focus:outline-none focus:border-brand-gold/40 transition-all resize-none shadow-inner text-white/80"
                value={script}
                onChange={(e) => setScript(e.target.value)}
              />
            </div>
            <button 
              onClick={handleResearchAndSequence}
              disabled={loading || !script}
              className="w-full bg-white text-brand-ink font-bold py-5 rounded-xl flex items-center justify-center gap-4 hover:bg-brand-gold transition-all active:scale-[0.99] disabled:opacity-30 group"
            >
              {loading ? (
                <div className="flex items-center gap-3">
                  <div className="animate-spin h-5 w-5 border-2 border-brand-red border-t-transparent rounded-full" />
                  <span className="uppercase tracking-widest text-xs font-mono">Synthesizing Aesthetic Layer...</span>
                </div>
              ) : (
                <>
                  <Sparkles size={20} className="group-hover:scale-125 transition-transform" />
                  <span className="uppercase tracking-[0.2em] text-sm">Generate Storyboard</span>
                </>
              )}
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-brand-ink text-white font-sans selection:bg-brand-red selection:text-white">
      {/* Header */}
      <header className="border-b border-white/5 p-6 flex flex-wrap items-center justify-between gap-6 sticky top-0 bg-brand-ink/90 backdrop-blur-xl z-[100]">
        <div className="flex items-center gap-6">
          <div>
            <h2 className="text-3xl font-display tracking-tight leading-none text-white">
              Genvyd <span className="text-brand-red">Production</span>
            </h2>
            <div className="flex items-center gap-1 mt-1">
              <div className="h-1 w-1 rounded-full bg-brand-red animate-pulse" />
              <span className="text-[9px] font-mono tracking-widest text-white/40 uppercase">Production Hub</span>
            </div>
          </div>
          <div className="h-8 w-px bg-white/10" />
          <div className="hidden lg:flex flex-col max-w-md">
            <span className="text-[9px] uppercase tracking-widest text-brand-gold font-mono font-bold">Heroic Intent</span>
            <span className="text-[11px] text-white/60 leading-tight line-clamp-2">{brandReport?.mission || "N/A"}</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {user ? (
            <div className="flex items-center gap-3 pr-4 border-r border-white/5 no-print">
              <div className="flex flex-col items-end">
                <span className="text-[10px] font-mono text-white/80 uppercase tracking-widest">{user.displayName}</span>
                <div className="flex items-center gap-1">
                  {isCloudSyncing ? (
                    <RefreshCcw size={10} className="text-brand-cyan animate-spin" />
                  ) : !syncEnabled ? (
                    <div className="flex items-center gap-1 cursor-pointer" onClick={toggleSync} title="Sync Disabled">
                      <CloudOff size={10} className="text-white/20" />
                      <span className="text-[8px] font-mono text-white/20 uppercase">Offline</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 cursor-pointer" onClick={toggleSync} title="Sync Active">
                      <Cloud size={10} className="text-brand-cyan" />
                      <span className="text-[8px] font-mono text-white/30 uppercase">Vault Active</span>
                    </div>
                  )}
                </div>
              </div>
              {user.photoURL ? (
                <img src={user.photoURL} className="w-8 h-8 rounded-full border border-brand-gold/20 shadow-lg" alt={user.displayName || "User"} />
              ) : (
                <div className="w-8 h-8 rounded-full bg-brand-red/10 flex items-center justify-center border border-brand-red/20">
                  <UserIcon size={16} className="text-brand-red" />
                </div>
              )}
              <button 
                onClick={logout}
                className="text-white/20 hover:text-red-500 transition-all p-2"
                title="Sign Out"
              >
                <LogOut size={16} />
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-end gap-1">
              <button 
                onClick={login}
                disabled={isLoggingIn}
                className="flex items-center gap-2 px-4 py-2 bg-brand-red/10 text-brand-red border border-brand-red/20 rounded-xl text-[10px] uppercase font-mono tracking-widest font-black transition-all hover:bg-brand-red hover:text-black no-print disabled:opacity-50"
              >
                {isLoggingIn ? <RefreshCcw size={14} className="animate-spin" /> : <LogIn size={14} />}
                {isLoggingIn ? "Auth..." : "Sign In"}
              </button>
              {loginError && (
                <span className="text-[8px] text-red-500 font-mono uppercase no-print">
                  {loginError}
                </span>
              )}
            </div>
          )}

          <div className="flex items-center bg-white/5 p-1 rounded-xl border border-white/5 no-print">
            <button 
              onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all ${showFavoritesOnly ? "bg-brand-red text-white shadow-xl" : "text-white/20 hover:text-white/40"}`}
              title="Show Favorites Only"
            >
              <Sparkles size={14} fill={showFavoritesOnly ? "currentColor" : "none"} />
              <span className="text-[10px] uppercase font-mono font-black">Favs</span>
            </button>
            <div className="w-px h-4 bg-white/10 mx-1" />
            <button 
              onClick={() => setEditorMode("list")}
              className={`p-2 rounded-lg transition-all ${editorMode === "list" ? "bg-white/10 text-white shadow-xl" : "text-white/20 hover:text-white/40"}`}
              title="List View"
            >
              <Terminal size={16} />
            </button>
            <button 
              onClick={() => setEditorMode("grid")}
              className={`p-2 rounded-lg transition-all ${editorMode === "grid" ? "bg-white/10 text-white shadow-xl" : "text-white/20 hover:text-white/40"}`}
              title="Visual Flow Grid"
            >
              <LayoutGrid size={16} />
            </button>
            <div className="w-px h-4 bg-white/10 mx-1" />
            <button 
              onClick={() => setView(view === "gallery" ? "editor" : "gallery")}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all ${view === "gallery" ? "bg-brand-gold text-black shadow-xl" : "text-brand-gold/40 hover:text-brand-gold bg-brand-gold/5"}`}
              title="View Visual Gallery"
            >
              <Maximize2 size={14} />
              <span className="text-[10px] uppercase font-mono font-black">Gallery</span>
            </button>
          </div>
          <button 
            onClick={printStoryboard}
            className="flex items-center gap-2 px-3 py-1.5 bg-brand-red text-white rounded-lg text-[10px] uppercase font-mono tracking-widest font-black transition-all hover:scale-105 active:scale-95"
            title="Generate Production PDF"
          >
            <Download size={14} /> Production PDF
          </button>
          <button 
            onClick={exportDirectorsPack}
            className="flex items-center gap-2 px-3 py-1.5 bg-brand-red text-white rounded-lg text-[10px] uppercase font-mono tracking-widest font-black transition-all hover:scale-105 active:scale-95 no-print"
            title="Export Animator Pack"
          >
            <FileText size={14} /> Director's Pack
          </button>
          <button 
            onClick={exportProject}
            className="flex items-center gap-2 px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-[10px] uppercase font-mono tracking-widest text-white/50 transition-all"
            title="Download JSON Storyboard"
          >
            <FolderOpen size={14} /> Export
          </button>
          <button 
            onClick={() => setView("projects")}
            className="text-[10px] uppercase tracking-widest text-gray-500 hover:text-white transition-colors flex items-center gap-2 px-4 py-2 hover:bg-white/5 rounded-lg"
          >
            Switch Project
          </button>
        </div>
      </header>

      <main className="p-8 space-y-16 max-w-[1700px] mx-auto">
        {view === "gallery" ? (
          <section className="space-y-12">
            <div className="flex items-center justify-between border-b border-white/5 pb-8">
              <div>
                <h1 className="text-4xl font-display italic tracking-tight">
                  Visual <span className="text-brand-gold">Gallery</span>
                </h1>
                <p className="text-[10px] uppercase font-mono tracking-widest text-white/30 mt-2">Sequential Production Review</p>
              </div>
              <button 
                onClick={() => setView("editor")}
                className="bg-white/5 text-white/60 hover:text-white px-6 py-3 rounded-xl border border-white/10 text-xs font-mono uppercase tracking-[0.2em] transition-all"
              >
                Exit Gallery
              </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
              {shots.map((shot) => {
                const activeVersion = shot.versions.find(v => v.id === shot.selectedVersionId) || shot.versions[0];
                return (
                  <motion.div 
                    key={shot.id}
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="aspect-video relative group overflow-hidden rounded-2xl bg-black/60 border border-white/5 shadow-2xl cursor-pointer"
                    onClick={() => setSelectedImage(activeVersion.imagePreview || null)}
                  >
                    {activeVersion?.imagePreview ? (
                      <>
                        <img 
                          src={activeVersion.imagePreview} 
                          alt={shot.title} 
                          className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-105" 
                        />
                        <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <Maximize2 className="text-white opacity-40" size={24} />
                        </div>
                      </>
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center font-mono opacity-10">
                        <Camera size={48} />
                        <span className="text-[10px] mt-4 uppercase tracking-[0.4em]">Empty {shot.index}</span>
                      </div>
                    )}
                    {/* Index small overlay for orientation only on hover */}
                    <div className="absolute top-4 left-4 opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="bg-black/60 backdrop-blur-md px-2 py-1 rounded border border-white/10">
                        <span className="text-[9px] font-mono font-black text-brand-gold">{shot.index}</span>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>

            {shots.length === 0 && (
              <div className="py-40 text-center glass-panel rounded-[3rem] border border-white/5 bg-black/20">
                 <LayoutGrid className="mx-auto text-white/5 mb-6" size={64} />
                 <h3 className="text-gray-500 font-mono text-sm uppercase tracking-[0.5em]">Sequence Data Buffer Empty</h3>
                 <button onClick={() => setView("editor")} className="mt-8 text-brand-gold uppercase font-mono text-xs tracking-widest hover:underline transition-all">Generate Sequence First</button>
              </div>
            )}
          </section>
        ) : (
          <div className="space-y-8">
            {/* Quick Style Assistant Block (Full width) */}
            <motion.div 
              initial={{ opacity: 0, y: -10 }} 
              animate={{ opacity: 1, y: 0 }} 
              className="glass-panel p-6 rounded-2xl border-l-[3px] border-brand-cyan relative overflow-hidden space-y-4 no-print shadow-[0_0_50px_rgba(34,211,238,0.03)]"
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-3 text-brand-cyan">
                  <Sparkles size={18} className="animate-pulse" />
                  <div>
                    <h3 className="text-xs uppercase tracking-[0.3em] font-mono font-black text-white">⭐ Quick Style Assistant</h3>
                    <p className="text-[10px] text-white/40 font-mono uppercase tracking-widest mt-0.5">Auto-generate cinematic specifications from simple directives</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {[
                    "🏢 Corporate & Bright",
                    "🌆 Retro Warm Movie",
                    "⚡ Dark Cyberpunk",
                    "🎥 Handheld Documentary"
                  ].map(suggestion => (
                    <button
                      key={suggestion}
                      onClick={() => setQuickStyleDirective(suggestion.replace(/^[^\w]*\s*/, ''))}
                      className="text-[9px] font-mono bg-white/5 border border-white/5 hover:border-white/10 text-white/60 px-2.5 py-1 rounded-full transition-all hover:bg-white/10"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  type="text"
                  placeholder="e.g. corporate style and bright, nostalgic 70s warm Polaroid film, cinematic dark fantasy..."
                  className="flex-1 bg-black/40 border border-white/5 focus:border-brand-cyan/40 rounded-xl px-4 py-3.5 text-sm font-mono text-white/80 focus:outline-none"
                  value={quickStyleDirective}
                  onChange={(e) => setQuickStyleDirective(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleQuickStyleGenerate()}
                />
                <button
                  onClick={handleQuickStyleGenerate}
                  disabled={loading || !quickStyleDirective}
                  className="bg-brand-cyan text-black font-black text-[10px] uppercase tracking-widest px-6 py-3.5 sm:py-0 rounded-xl hover:bg-white hover:text-black transition-all active:scale-95 disabled:opacity-30 whitespace-nowrap"
                >
                  {loading ? "Generating Specifications..." : "Auto-Fill Spec"}
                </button>
              </div>

              {showApplyPassBanner && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }} 
                  animate={{ opacity: 1, height: "auto" }}
                  className="bg-brand-cyan/5 border border-brand-cyan/20 rounded-xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                >
                  <div className="space-y-1">
                    <span className="text-[9px] font-mono text-brand-cyan font-black uppercase tracking-widest block">Aesthetic specs suggested successfully</span>
                    <p className="text-[10.5px] text-white/80 font-mono leading-relaxed">{generatedStyleSummary}</p>
                    <span className="text-[8.5px] font-mono text-white/30 uppercase tracking-widest block">
                      The optics, lighting strategy, atmosphere, and recurring visual elements below have been updated.
                    </span>
                  </div>
                  <div className="flex gap-2.5 flex-wrap sm:flex-nowrap">
                    <button
                      onClick={() => {
                        const directive = `Refine storyboard styling and details to match updated aesthetic spec: ${generatedStyleSummary}`;
                        setGlobalRefinement(directive);
                        setShowApplyPassBanner(false);
                        // Trigger immediate refinement with the calculated directive parameter
                        handleGlobalRefinement(directive);
                      }}
                      className="bg-brand-cyan text-black font-black text-[9.5px] uppercase tracking-widest px-4 py-3 rounded-lg hover:bg-white hover:text-black transition-all whitespace-nowrap active:scale-95"
                    >
                      Apply to All Storyboard Shots (Rerun prompts)
                    </button>
                    <button
                      onClick={() => setShowApplyPassBanner(false)}
                      className="bg-white/5 text-white/60 border border-white/10 text-[9.5px] font-mono uppercase tracking-widest px-4 py-3 rounded-lg hover:bg-white/10 hover:text-white transition-all"
                    >
                      Keep Specs Only
                    </button>
                  </div>
                </motion.div>
              )}
            </motion.div>

            {/* Brand Intel Dashboard */}
            <section className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="glass-panel p-8 rounded-2xl border-l-[3px] border-brand-gold space-y-5">
                <div className="flex items-center justify-between group">
                  <div className="flex items-center gap-3 text-brand-gold">
                    <Info size={16} />
                    <h3 className="text-[10px] uppercase tracking-[0.3em] font-mono font-black">Strategic Anchor</h3>
                  </div>
                  <Edit3 size={12} className="text-white/20" />
                </div>
                <textarea 
                  className="w-full bg-transparent text-sm leading-relaxed text-gray-200 font-medium focus:outline-none focus:ring-1 focus:ring-brand-gold/20 rounded p-1 resize-none h-24"
                  value={brandReport?.narrativeAnchor || ""}
                  onChange={(e) => setBrandReportSync({ ...brandReport!, narrativeAnchor: e.target.value })}
                />
                <p className="text-[9px] font-mono text-white/30 uppercase tracking-widest leading-loose pt-2 border-t border-white/[0.03]">
                  🧭 The non-negotiable core creative thesis of the project. It aligns all storyboard iterations and prevents style drift.
                </p>
              </motion.div>
          
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass-panel p-8 rounded-2xl border-l-[3px] border-brand-cyan space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 text-brand-cyan">
                <Sparkles size={16} />
                <h3 className="text-[10px] uppercase tracking-[0.3em] font-mono font-black">Recurring Visual Elements</h3>
              </div>
              <button 
                onClick={() => {
                  setGlobalRefinement("Sync all shots to use these specific visual elements and character descriptions.");
                  handleGlobalRefinement();
                }}
                className="text-[9px] font-mono text-brand-cyan bg-brand-cyan/10 border border-brand-cyan/20 px-3 py-1 rounded-full hover:bg-brand-cyan hover:text-black transition-all uppercase tracking-widest active:scale-95"
              >
                Sync All Prompts
              </button>
            </div>
            <textarea 
              className="w-full bg-transparent text-[10px] font-mono uppercase tracking-wider text-brand-cyan/90 focus:outline-none focus:ring-1 focus:ring-brand-cyan/20 rounded p-1 resize-none h-24"
              value={(brandReport?.motifs || []).join(", ")}
              onChange={(e) => setBrandReportSync({ ...brandReport!, motifs: e.target.value.split(",").map(m => m.trim()).filter(m => m) })}
              placeholder="Separate elements with commas (e.g. volumetric smoke, blue retro neon flares, anamorphic glare)..."
            />
          </motion.div>

          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }} className="glass-panel p-8 rounded-2xl md:col-span-2 space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 text-white/50">
                <Film size={16} />
                <h3 className="text-[10px] uppercase tracking-[0.3em] font-mono font-black">The David Clark Aesthetic (Technical Spec)</h3>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex flex-col items-end">
                   <span className="text-[8px] uppercase font-mono text-gray-600">Renderer Optimization</span>
                   <input 
                     className="bg-transparent text-[10px] font-mono text-brand-gold text-right focus:outline-none border-b border-brand-gold/10"
                     value={brandReport.targetSoftware || ""}
                     placeholder="e.g. Midjourney v6"
                     onChange={(e) => setBrandReportSync({ ...brandReport, targetSoftware: e.target.value })}
                   />
                </div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-8">
              <div className="space-y-2">
                <span className="text-[9px] uppercase tracking-widest text-brand-gold/60 font-mono font-bold block">Optics & Sensor</span>
                <input 
                  className="w-full bg-transparent text-[11px] leading-relaxed text-white/80 font-medium focus:outline-none border-b border-white/5 focus:border-brand-gold/20"
                  value={brandReport?.cinematicProfile?.lens || ""}
                  onChange={(e) => setBrandReportSync({ 
                    ...brandReport!, 
                    cinematicProfile: { ...(brandReport?.cinematicProfile || { lighting: "", palette: "", lens: "" }), lens: e.target.value } 
                  })}
                />
              </div>
              <div className="space-y-2">
                <span className="text-[9px] uppercase tracking-widest text-brand-gold/60 font-mono font-bold block">Lighting Logic</span>
                <input 
                  className="w-full bg-transparent text-[11px] leading-relaxed text-white/80 font-medium focus:outline-none border-b border-white/5 focus:border-brand-gold/20"
                  value={brandReport?.cinematicProfile?.lighting || ""}
                  onChange={(e) => setBrandReportSync({ 
                    ...brandReport!, 
                    cinematicProfile: { ...(brandReport?.cinematicProfile || { lighting: "", palette: "", lens: "" }), lighting: e.target.value } 
                  })}
                />
              </div>
              <div className="space-y-2">
                <span className="text-[9px] uppercase tracking-widest text-brand-gold/60 font-mono font-bold block">Atmosphere</span>
                <input 
                  className="w-full bg-transparent text-[11px] leading-relaxed text-white/80 font-medium focus:outline-none border-b border-white/5 focus:border-brand-gold/20"
                  value={brandReport?.cinematicProfile?.palette || ""}
                  onChange={(e) => setBrandReportSync({ 
                    ...brandReport!, 
                    cinematicProfile: { ...(brandReport?.cinematicProfile || { lighting: "", palette: "", lens: "" }), palette: e.target.value } 
                  })}
                />
              </div>
            </div>
            
            <div className="pt-4 border-t border-white/5 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                   <Terminal size={12} className="text-brand-gold" />
                   <span className="text-[9px] uppercase font-mono text-gray-500 font-bold">Primary / Fallback Character Description</span>
                </div>
                <button 
                  onClick={() => {
                    const directive = "Sync sequence to the updated character description and brand technical specs.";
                    setGlobalRefinement(directive);
                    handleGlobalRefinement(directive);
                  }}
                  className="text-[9px] font-mono text-brand-gold bg-brand-gold/10 border border-brand-gold/20 px-3 py-1 rounded-full hover:bg-brand-gold hover:text-black transition-all uppercase tracking-widest active:scale-95"
                >
                  Apply Specs to All Shots
                </button>
              </div>
              <textarea 
                className="w-full bg-black/40 p-3 rounded-xl text-[10px] font-mono text-brand-gold focus:outline-none border border-white/5 focus:border-brand-gold/30 h-16 resize-none"
                placeholder="e.g. 'A stoic man in a weathered leather jacket with silver rimmed glasses...'"
                value={brandReport.characterDescription || ""}
                onChange={(e) => setBrandReportSync({ ...brandReport, characterDescription: e.target.value })}
              />
            </div>

            {/* Multi-Character Cast Management */}
            <div className="pt-4 border-t border-white/5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-brand-gold">
                  <Users size={14} />
                  <span className="text-[10px] uppercase font-mono font-black tracking-widest text-white/80">
                    Character Cast Profiles
                  </span>
                </div>
                <button
                  onClick={() => {
                    const currentCharacters = brandReport.characters || [];
                    const newChar = {
                      id: Math.random().toString(36).substr(2, 9),
                      name: `Character ${currentCharacters.length + 1}`,
                      description: ""
                    };
                    setBrandReportSync({
                      ...brandReport,
                      characters: [...currentCharacters, newChar]
                    });
                  }}
                  className="text-[9px] font-mono text-brand-cyan bg-brand-cyan/10 border border-brand-cyan/20 px-3.5 py-1.5 rounded-full hover:bg-brand-cyan hover:text-black transition-all uppercase tracking-widest flex items-center gap-1 active:scale-95"
                >
                  <Plus size={10} /> Add Character
                </button>
              </div>

              {/* Characters list */}
              {(!brandReport.characters || brandReport.characters.length === 0) ? (
                <p className="text-[9px] text-white/30 font-mono uppercase italic leading-loose">
                  No additional cast members defined. Select "Add Character" to designate specific profiles for dynamic shots.
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-3 max-h-[220px] overflow-y-auto pr-1">
                  {brandReport.characters.map((char, index) => (
                    <div key={char.id} className="relative bg-black/40 border border-white/5 rounded-xl p-3.5 flex flex-col gap-2 group hover:border-brand-cyan/20 transition-all">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-1">
                          <span className="text-[9px] font-mono text-white/30">#{index + 1}</span>
                          <input
                            type="text"
                            className="bg-transparent text-[10.5px] font-mono font-bold text-brand-cyan focus:outline-none border-b border-transparent focus:border-brand-cyan/30 pb-0.5 w-full uppercase tracking-wider"
                            placeholder="Character Name (e.g., Detective Miller)"
                            value={char.name}
                            onChange={(e) => {
                              const updated = (brandReport.characters || []).map(c => 
                                c.id === char.id ? { ...c, name: e.target.value } : c
                              );
                              setBrandReportSync({ ...brandReport, characters: updated });
                            }}
                          />
                        </div>
                        <button
                          onClick={() => {
                            const updated = (brandReport.characters || []).filter(c => c.id !== char.id);
                            setBrandReportSync({ ...brandReport, characters: updated });
                          }}
                          className="text-white/20 hover:text-red-500 hover:bg-red-500/10 p-1 rounded transition-colors"
                          title="Remove character"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                      <textarea
                        className="w-full bg-black/30 p-2 rounded-lg text-[10px] font-mono text-white/70 focus:outline-none border border-white/5 focus:border-brand-cyan/20 h-14 resize-none leading-relaxed"
                        placeholder="Provide physical descriptors, outfit specs, age, and style keys for generator continuity..."
                        value={char.description}
                        onChange={(e) => {
                          const updated = (brandReport.characters || []).map(c => 
                            c.id === char.id ? { ...c, description: e.target.value } : c
                          );
                          setBrandReportSync({ ...brandReport, characters: updated });
                        }}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        </section>

        {/* Global Creative Refinement Bar */}
        <section className="no-print">
          <div className="bg-brand-gold/[0.03] border border-brand-gold/10 rounded-2xl p-6 flex flex-col md:flex-row items-center gap-6 group hover:border-brand-gold/20 transition-all">
            <div className="flex items-center gap-4 min-w-fit">
              <div className="h-10 w-10 flex items-center justify-center bg-brand-red/10 text-brand-red rounded-full group-hover:scale-110 transition-transform">
                <Zap size={20} />
              </div>
              <div>
                <h3 className="text-[10px] uppercase tracking-[0.3em] font-mono font-black text-white">Global Refinement</h3>
                <p className="text-[10px] text-white/40 font-mono mt-0.5 uppercase tracking-widest leading-none">Apply style pass to all shots</p>
              </div>
            </div>
            
            <div className="flex-1 w-full relative">
              <input 
                type="text"
                placeholder="e.g., 'Make it more cinematic and bright, add anamorphic flares, remove grunge' or 'Add a blue neon cyberpunk tint'"
                className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:border-brand-gold/40 transition-all text-white/70 placeholder:text-white/30"
                value={globalRefinement}
                onChange={(e) => setGlobalRefinement(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleGlobalRefinement()}
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <span className="text-[9px] font-mono text-white/10 uppercase tracking-widest hidden lg:block">Press Enter to Process</span>
              </div>
            </div>

            <button 
              onClick={() => handleGlobalRefinement()}
              disabled={loading || !globalRefinement}
              className="bg-brand-red text-white font-black text-[10px] uppercase tracking-[0.2em] px-8 py-3 rounded-xl hover:bg-white hover:text-black transition-all active:scale-95 disabled:opacity-30 disabled:hover:bg-brand-red"
            >
              {loading ? "Synthesizing..." : "Refine All"}
            </button>
          </div>
        </section>

        {/* Shot Sequence */}
        <section className="space-y-10">
          <div className="flex items-center justify-between border-b border-white/5 pb-4">
            <h3 className="text-2xl font-display italic">Production <span className="text-brand-gold">Shot List</span></h3>
            <div className="flex items-center gap-6">
               <div className="flex items-center gap-2">
                 <div className="w-2 h-2 rounded-full bg-brand-cyan" />
                 <span className="text-[9px] font-mono text-gray-500 uppercase">Establishing (a)</span>
               </div>
               <div className="flex items-center gap-2">
                 <div className="w-2 h-2 rounded-full bg-brand-gold" />
                 <span className="text-[9px] font-mono text-gray-500 uppercase">Detail/Glitch (b)</span>
               </div>
            </div>
          </div>

          <div id="storyboard-container" className="space-y-12">
            {(Object.entries(groupedShots) as [string, Shot[]][]).map(([beat, beatShots]) => (
              <div key={beat} className="space-y-4">
                <div className="flex items-center gap-4 mb-2">
                  <div className="bg-white/5 px-2 py-1 rounded text-[10px] font-mono font-black text-white/30 border border-white/5 uppercase">Beat {beat}</div>
                  <div className="h-px flex-1 bg-gradient-to-r from-white/5 to-transparent" />
                </div>
                
                <div className={`grid gap-6 ${editorMode === "grid" ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-3" : "grid-cols-1"}`}>
                  {beatShots.map((shot) => {
                    const activeVersion = (shot.versions || []).find(v => v.id === shot.selectedVersionId) || (shot.versions || [])[0];
                    if (!activeVersion) return null;

                    return (
                      <motion.div 
                        key={shot.id}
                        layout
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`grid grid-cols-1 ${editorMode === "grid" ? "" : "lg:grid-cols-12"} gap-px rounded-2xl overflow-hidden border transition-all ${
                          shot.context === "Legacy" ? "border-red-500/10 bg-red-500/[0.02]" : "border-white/5 bg-white/[0.02]"
                        }`}
                      >
                        {/* Column 1: Asset Hosting & Preview (Left in List, Top in Grid) */}
                        <div className={`${editorMode === "grid" ? "w-full" : "lg:col-span-3"} p-6 flex flex-col gap-4 border-r border-white/5`}>
                          <div className="flex items-center justify-between">
                            <span className={`text-[10px] font-mono tracking-widest font-black ${shot.index.includes('b') ? 'text-brand-gold' : 'text-brand-cyan'}`}>
                               {shot.index} // {shot.type.toUpperCase()}
                            </span>
                            <div className="flex items-center gap-2">
                               {brandReport?.targetSoftware && (
                                 <span className="text-[8px] font-mono bg-brand-gold/10 text-brand-gold px-2 py-0.5 rounded border border-brand-gold/20 flex items-center gap-1 no-print">
                                   <Zap size={8} />
                                   {brandReport.targetSoftware}
                                 </span>
                               )}
                               {shot.versions.length > 1 && (
                                 <div className="flex gap-1 bg-black/40 p-1 rounded-full border border-white/5 no-print">
                                   {shot.versions.map((v, idx) => (
                                     <button
                                       key={v.id}
                                       onClick={() => selectVersion(shot.id, v.id)}
                                       className={`w-2 h-2 rounded-full transition-all ${v.id === shot.selectedVersionId ? 'bg-brand-gold scale-125' : 'bg-white/20 hover:bg-white/40'}`}
                                       title={`Version ${idx + 1}`}
                                     />
                                   ))}
                                 </div>
                               )}
                               <span className={`text-[9px] font-mono px-2 py-0.5 rounded border ${
                                 shot.context === "Legacy" ? "border-red-500/50 text-red-500" : "border-brand-cyan/50 text-brand-cyan"
                               }`}>
                                 {shot.context}
                               </span>
                            </div>
                          </div>
                          
                          <div className="flex-1 relative group bg-black/40 rounded-xl border border-dashed border-white/10 flex items-center justify-center overflow-hidden transition-all hover:border-brand-gold/30 min-h-[160px] max-h-[400px]">
                            {activeVersion.imagePreview ? (
                              <div className="relative w-full h-full flex items-center justify-center">
                                <img 
                                  src={activeVersion.imagePreview} 
                                  alt="Preview" 
                                  className="max-w-full max-h-full object-contain shadow-2xl" 
                                />
                                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4">
                                  <label className="cursor-pointer bg-white text-black h-12 w-12 rounded-full flex items-center justify-center hover:bg-brand-gold transition-all shadow-2xl active:scale-95">
                                    <Upload size={20} />
                                    <input type="file" className="hidden" accept="image/*" onChange={(e) => {
                                      e.stopPropagation();
                                      if (e.target.files) handleFileUpload(shot.id, e.target.files[0]);
                                    }} />
                                  </label>
                                  <button 
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedImage(activeVersion.imagePreview || null);
                                    }}
                                    className="bg-white text-black h-12 w-12 rounded-full flex items-center justify-center hover:bg-brand-gold transition-all shadow-2xl active:scale-95"
                                  >
                                    <Maximize2 size={20} />
                                  </button>
                                </div>
                                {shot.requiresFaceSwap && (
                                  <div className="absolute top-2 left-2 bg-red-500 text-white text-[8px] font-mono px-2 py-1 rounded-md shadow-lg animate-pulse uppercase tracking-widest font-black flex items-center gap-1">
                                    <RefreshCcw size={10} />
                                    Face Swap AI Required
                                  </div>
                                )}
                              </div>
                            ) : (
                              <label className="cursor-pointer flex flex-col items-center gap-3 text-white/30 hover:text-white/80 transition-all">
                                <Upload size={24} className="opacity-30" />
                                <span className="text-[10px] uppercase font-mono tracking-widest font-bold">Upload Render</span>
                                <input type="file" className="hidden" accept="image/*" onChange={(e) => {
                                  e.stopPropagation();
                                  if (e.target.files) handleFileUpload(shot.id, e.target.files[0]);
                                }} />
                              </label>
                            )}
                          </div>
                          <div className="space-y-1">
                            <span className="text-[9px] uppercase font-mono tracking-widest text-gray-600 font-bold">Shot Title</span>
                            <input 
                              className="w-full bg-transparent text-sm font-display italic focus:outline-none placeholder:text-white/10" 
                              value={shot.title}
                              placeholder="Enter title..."
                              onChange={(e) => updateShot(shot.id, { title: e.target.value })}
                            />
                          </div>

                          <div className="flex flex-col gap-2 pt-2 border-t border-white/5 no-print">
                            <div className="flex flex-wrap gap-2">
                              <button 
                                onClick={() => {
                                  const newIsCharVal = !shot.isCharacterShot;
                                  const firstCharId = brandReport?.characters?.[0]?.id || "";
                                  updateShot(shot.id, { 
                                    isCharacterShot: newIsCharVal,
                                    characterId: newIsCharVal ? (shot.characterId || firstCharId) : undefined
                                  });
                                }}
                                className={`flex items-center gap-2 px-2 py-1 rounded text-[9px] font-mono uppercase tracking-widest transition-all ${shot.isCharacterShot ? 'bg-brand-red text-white font-black' : 'bg-white/5 text-white/40 hover:text-white/60'}`}
                              >
                                <CheckCircle2 size={10} />
                                Same Character
                              </button>
                              <button 
                                onClick={() => updateShot(shot.id, { requiresFaceSwap: !shot.requiresFaceSwap })}
                                className={`flex items-center gap-2 px-2 py-1 rounded text-[9px] font-mono uppercase tracking-widest transition-all ${shot.requiresFaceSwap ? 'bg-red-500 text-white font-black' : 'bg-white/5 text-white/40 hover:text-white/60'}`}
                              >
                                <RefreshCcw size={10} />
                                Face Swap Req.
                              </button>
                            </div>

                            {shot.isCharacterShot && brandReport?.characters && brandReport.characters.length > 0 && (
                              <div className="flex items-center gap-1.5 w-full bg-black/40 border border-white/5 rounded-xl px-2.5 py-1.5">
                                <span className="text-[8px] font-mono uppercase text-white/40 tracking-wider">Cast:</span>
                                <select
                                  className="bg-transparent text-[9px] font-mono text-brand-gold font-bold focus:outline-none cursor-pointer flex-1"
                                  value={shot.characterId || ""}
                                  onChange={(e) => updateShot(shot.id, { characterId: e.target.value })}
                                >
                                  <option value="" className="bg-black text-[9px] font-mono text-white/40">-- Default Character --</option>
                                  {brandReport.characters.map(c => (
                                    <option key={c.id} value={c.id} className="bg-black text-[9px] font-mono text-brand-gold">
                                      {c.name}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            )}
                          </div>

                          <div className="space-y-2 mt-2">
                             <div className="flex items-center justify-between">
                               <span className="text-[9px] uppercase font-mono tracking-widest text-white/40 font-bold">Voiceover.File</span>
                               {activeVersion.audioPreview && (
                                 <button 
                                   onClick={() => {
                                     const newVersions = shot.versions.map(v => 
                                       v.id === activeVersion.id ? { ...v, audioPreview: undefined } : v
                                     );
                                     updateShot(shot.id, { versions: newVersions });
                                   }}
                                   className="text-[9px] text-red-500 hover:underline uppercase font-mono"
                                 >
                                   Remove
                                 </button>
                               )}
                             </div>
                             {activeVersion.audioPreview ? (
                               <div className="bg-black/40 rounded-xl p-2 border border-white/5 flex items-center gap-3">
                                 <Mic size={14} className="text-brand-gold" />
                                 <audio src={activeVersion.audioPreview} controls className="h-6 w-full opacity-50 contrast-125" />
                               </div>
                             ) : (
                               <label className="cursor-pointer flex items-center gap-3 p-3 bg-white/[0.02] border border-dashed border-white/10 rounded-xl text-gray-500 hover:text-brand-gold hover:border-brand-gold/30 transition-all">
                                 <Music size={16} className="opacity-30" />
                                 <span className="text-[10px] uppercase font-mono tracking-widest">Upload VO</span>
                                 <input type="file" className="hidden" accept="audio/*" onChange={(e) => e.target.files && handleAudioUpload(shot.id, e.target.files[0])} />
                               </label>
                             )}
                          </div>
                        </div>

                        {/* Column 2: Prompts & Details (Right in List, Bottom in Grid) */}
                        <div className={`${editorMode === "grid" ? "w-full" : "lg:col-span-9 flex flex-col lg:flex-row"} h-full`}>
                          {/* Sub-column: Image Prompt & Creative */}
                          <div className={`${editorMode === "grid" ? "p-4 space-y-4" : "flex-1 p-8 border-r border-white/5 bg-black/10"} space-y-6 flex flex-col justify-between`}>
                            <div className="space-y-4">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <Camera size={14} className="text-brand-gold" />
                                  <span className="text-[10px] uppercase font-mono tracking-widest text-white/40 font-black">Image.Prompt</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <button 
                                    onClick={() => toggleFavoriteVersion(shot.id, activeVersion.id)}
                                    className={`p-1 transition-all rounded ${activeVersion.isFavorite ? 'text-brand-gold' : 'text-white/10 hover:text-white/30'}`}
                                    title="Mark as Favorite"
                                  >
                                    <Sparkles size={14} fill={activeVersion.isFavorite ? "currentColor" : "none"} />
                                  </button>
                                  <button 
                                    onClick={() => copyToClipboard(activeVersion.imagePrompt)} 
                                    className="text-white/40 hover:text-brand-gold p-1 transition-all rounded"
                                  >
                                    <Copy size={14} />
                                  </button>
                                </div>
                              </div>
                              <div className="bg-brand-ink/80 rounded-xl border border-white/5 overflow-hidden">
                                <textarea 
                                  className="w-full bg-transparent p-5 text-[11px] font-mono leading-relaxed text-brand-cyan/80 focus:outline-none scrollbar-hide resize-none"
                                  value={activeVersion.imagePrompt}
                                  rows={editorMode === "grid" ? 4 : 8}
                                  onChange={(e) => {
                                    const newVersions = shot.versions.map(v => 
                                      v.id === activeVersion.id ? { ...v, imagePrompt: e.target.value } : v
                                    );
                                    updateShot(shot.id, { versions: newVersions });
                                  }}
                                />
                              </div>
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <Lightbulb size={12} className="text-brand-gold/60" />
                                  <span className="text-[10px] uppercase font-mono tracking-widest text-white/40 font-bold">Prompt.Refinement</span>
                                </div>
                                <textarea 
                                  className="w-full bg-black/40 border border-white/5 rounded-lg p-2 text-[10px] font-mono focus:outline-none focus:border-brand-gold/40 transition-all text-white/40 placeholder:opacity-20"
                                  placeholder="Add specific ideas..."
                                  rows={1}
                                  value={shot.promptIdeas || ""}
                                  onChange={(e) => updateShot(shot.id, { promptIdeas: e.target.value })}
                                />
                              </div>
                            </div>

                            <div className="space-y-4">
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <MessageSquare size={12} className="text-brand-gold/60" />
                                  <span className="text-[10px] uppercase font-mono tracking-widest text-white/40 font-bold">Dialogue.VO</span>
                                </div>
                                <textarea 
                                  className="w-full bg-black/60 border border-white/5 rounded-lg p-3 text-[11px] focus:outline-none focus:border-brand-gold/40 transition-all font-sans leading-relaxed text-white/90 placeholder:italic"
                                  placeholder="Voiceover content..."
                                  rows={2}
                                  value={shot.dialogue || ""}
                                  onChange={(e) => updateShot(shot.id, { dialogue: e.target.value })}
                                />
                              </div>
                            </div>
                          </div>

                          {/* Sub-column: Motion & Management */}
                          <div className={`${editorMode === "grid" ? "p-4 space-y-4 pt-0" : "flex-1 p-8 bg-black/30"} space-y-6 flex flex-col justify-between`}>
                             <div className="space-y-4">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <Film size={14} className="text-brand-gold" />
                                  <span className="text-[10px] uppercase font-mono tracking-widest text-white/40 font-black">Motion.Params</span>
                                </div>
                                <button 
                                  onClick={() => copyToClipboard(activeVersion.motionPrompt)} 
                                  className="text-gray-500 hover:text-brand-gold p-1 transition-all rounded"
                                >
                                  <Copy size={14} />
                                </button>
                              </div>
                              <div className="bg-brand-ink/80 rounded-xl border border-white/5 overflow-hidden">
                                <textarea 
                                  className="w-full bg-transparent p-5 text-[11px] font-mono leading-relaxed text-brand-gold/80 focus:outline-none italic resize-none"
                                  value={activeVersion.motionPrompt}
                                  rows={editorMode === "grid" ? 3 : 6}
                                  onChange={(e) => {
                                    const newVersions = shot.versions.map(v => 
                                      v.id === activeVersion.id ? { ...v, motionPrompt: e.target.value } : v
                                    );
                                    updateShot(shot.id, { versions: newVersions });
                                  }}
                                />
                              </div>
                            </div>

                            <div className="space-y-4">
                              <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                  <Plus size={12} className="text-white/30" />
                                  <span className="text-[9px] uppercase font-mono tracking-widest text-white/40 font-bold">Director's Notes</span>
                                </div>
                                <textarea 
                                  className="w-full bg-black/60 border border-white/5 rounded-lg p-3 text-[11px] focus:outline-none focus:border-brand-gold/40 transition-all font-sans leading-relaxed text-white/50 placeholder:italic"
                                  placeholder="Notes..."
                                  rows={2}
                                  value={shot.notes}
                                  onChange={(e) => updateShot(shot.id, { notes: e.target.value })}
                                />
                              </div>

                              <div className="flex items-center gap-3 pt-4 border-t border-white/5">
                                 <div className="flex items-center bg-white/5 rounded-lg border border-white/5 no-print">
                                   <button 
                                     onClick={() => moveShot(shot.id, 'up')}
                                     className="p-1.5 hover:bg-brand-gold/20 text-white/40 hover:text-brand-gold transition-all border-r border-white/5"
                                     title="Move Up"
                                   >
                                     <ChevronLeft size={12} className="rotate-90" />
                                   </button>
                                   <button 
                                     onClick={() => moveShot(shot.id, 'down')}
                                     className="p-1.5 hover:bg-brand-gold/20 text-white/40 hover:text-brand-gold transition-all"
                                     title="Move Down"
                                   >
                                     <ChevronLeft size={12} className="-rotate-90" />
                                   </button>
                                 </div>
                                 
                                 <button 
                                   onClick={() => addShotAfter(shot.id)}
                                   className="text-[9px] font-mono text-brand-cyan px-2 py-1 bg-brand-cyan/10 border border-brand-cyan/20 rounded-md hover:bg-brand-cyan hover:text-black uppercase tracking-widest transition-all flex items-center gap-1.5 shadow-sm"
                                   title="Add Sub-shot (e.g. 1b, 2c)"
                                 >
                                   <PlusCircle size={10} />
                                   Add Sub-Shot
                                 </button>
                                 
                                 <button 
                                   disabled={loading}
                                   onClick={() => handleRegenerate(shot)} 
                                   className="text-[9px] font-mono text-brand-gold px-2 py-1 bg-brand-gold/5 rounded-md hover:bg-brand-gold/10 uppercase tracking-widest transition-all flex items-center gap-1 disabled:opacity-20"
                                 >
                                   <RefreshCcw size={10} className={loading ? "animate-spin" : ""} />
                                   Refresh
                                 </button>

                                 {confirmDeleteShotId === shot.id ? (
                                   <button 
                                     onClick={() => removeShot(shot.id)}
                                     className="px-2 py-1 bg-red-500 text-white text-[9px] uppercase font-mono font-black rounded"
                                   >
                                     Confirm
                                   </button>
                                 ) : (
                                   <button 
                                     onClick={() => setConfirmDeleteShotId(shot.id)} 
                                     className="text-red-500/40 hover:text-red-500 p-1.5 transition-all"
                                     title="Remove Shot"
                                   >
                                     <Trash2 size={12} />
                                   </button>
                                 )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Master Contact Sheet Grid */}
        <section className="space-y-8 pt-20 border-t border-white/5">
          <div className="flex items-center gap-6">
            <h3 className="text-3xl font-display italic">Master <span className="text-brand-gold border-b border-brand-gold/30">Contact Sheet</span></h3>
            <div className="h-px flex-1 bg-gradient-to-r from-white/10 to-transparent" />
            <div className="flex items-center gap-3">
              <span className="text-[10px] uppercase font-mono tracking-[0.5em] text-gray-600 font-black">Production.Sequence.v1</span>
            </div>
          </div>
          
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-4">
            {shots.map((shot, i) => {
              const activeVersion = (shot.versions || []).find(v => v.id === shot.selectedVersionId) || (shot.versions || [])[0];
              return (
                <motion.div 
                  key={shot.id} 
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.05 }}
                  onClick={() => selectVersion(shot.id, activeVersion?.id || "")}
                  className="aspect-video bg-black/60 rounded-xl overflow-hidden border border-white/5 relative group cursor-pointer hover:border-brand-gold/50 transition-all"
                >
                  {activeVersion?.imagePreview ? (
                    <img src={activeVersion.imagePreview} alt={shot.title} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center p-4">
                      <div className="w-full h-px bg-white/5 mb-1" />
                      <span className="text-[8px] font-mono text-white/5 uppercase tracking-[0.3em]">No Render</span>
                      <div className="w-full h-px bg-white/5 mt-1" />
                    </div>
                  )}
                  <div className="absolute top-2 left-2 bg-black/90 px-2 py-0.5 rounded-md text-[9px] font-mono font-black text-brand-gold border border-brand-gold/10">
                    {shot.index}
                  </div>
                  {activeVersion?.id === shot.selectedVersionId && shot.title && (
                    <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black to-transparent opacity-0 group-hover:opacity-100 transition-opacity space-y-1">
                      <div className="text-[10px] font-mono text-white truncate italic font-black uppercase tracking-tighter">
                        {shot.title}
                      </div>
                      {shot.dialogue && (
                        <div className="text-[8px] font-mono text-brand-gold truncate leading-none opacity-80">
                          VO: {shot.dialogue}
                        </div>
                      )}
                    </div>
                  )}
                </motion.div>
              );
            })}
            {Array.from({ length: Math.max(0, 6 - shots.length) }).map((_, i) => (
              <div key={`empty-${i}`} className="aspect-video bg-white/[0.01] border border-dashed border-white/5 rounded-xl flex items-center justify-center">
                 <div className="h-4 w-4 rounded-full border border-white/5" />
              </div>
            ))}
          </div>
        </section>
      </div>
    )}
  </main>

      <footer className="p-20 text-center border-t border-white/5 bg-black/20">
        <div className="max-w-xl mx-auto space-y-6">
          <div className="flex justify-center gap-12 text-gray-600">
            <div className="flex flex-col items-center gap-1">
              <span className="text-[9px] font-mono uppercase tracking-widest">Build</span>
              <span className="text-[10px] font-mono text-white/40">GENVYD_ENGINE_4.1</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <span className="text-[9px] font-mono uppercase tracking-widest">Protocol</span>
              <span className="text-[10px] font-mono text-white/40">DAVID_CLARK_LOGIC_TRUE</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <span className="text-[9px] font-mono uppercase tracking-widest">User</span>
              <span className="text-[10px] font-mono text-white/40 uppercase">Production_Architect</span>
            </div>
          </div>
          <p className="text-[10px] uppercase tracking-[0.8em] text-gray-700 font-mono">
            System Instruction: End of Turn
          </p>
        </div>
      </footer>

      {/* Expanded View Modal */}
      <AnimatePresence>
        {selectedImage && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[2000] bg-black/95 flex items-center justify-center p-4 md:p-10 no-print"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative max-w-full max-h-full flex items-center justify-center"
              onClick={(e) => e.stopPropagation()}
            >
              <img 
                src={selectedImage} 
                alt="Expanded Render" 
                className="max-w-full max-h-[90vh] object-contain shadow-[0_0_100px_rgba(0,0,0,0.8)] border border-white/5 rounded-2xl" 
                onError={() => setSelectedImage(null)}
              />
              <button 
                onClick={() => setSelectedImage(null)}
                className="absolute -top-12 right-0 text-white/50 hover:text-white transition-all bg-white/5 p-2 rounded-full z-[210] hover:bg-red-500/40 backdrop-blur-xl border border-white/10 flex items-center gap-2 px-4"
              >
                <span className="text-[10px] font-mono uppercase tracking-widest">Close Preview</span>
                <X size={18} /> 
              </button>
            </motion.div>
            {/* Click outside to close */}
            <div className="absolute inset-0 z-[-1]" onClick={() => setSelectedImage(null)} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Global Progress Overlay */}
      {loading && (
        <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/40 backdrop-blur-[2px] no-print">
          <div className="max-w-md w-full px-8 text-center space-y-6">
            <motion.div 
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className="glass-panel p-10 rounded-[2.5rem] border-brand-gold/30 shadow-[0_40px_120px_rgba(0,0,0,1)] bg-black/90 relative overflow-hidden"
            >
              {/* Decorative scanning line */}
              <motion.div 
                animate={{ top: ["0%", "100%", "0%"] }}
                transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                className="absolute left-0 right-0 h-[1px] bg-brand-gold/20 shadow-[0_0_10px_brand-gold] z-0"
              />
              
              <div className="relative mb-8 z-10">
                <motion.div 
                  animate={{ rotate: 360 }}
                  transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                  className="w-20 h-20 mx-auto rounded-full border-2 border-brand-gold/5 border-t-brand-gold relative shadow-[0_0_30px_rgba(255,255,255,0.1)]"
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <Zap size={24} className="text-brand-gold animate-pulse shadow-brand-gold" />
                </div>
              </div>
              
              <div className="space-y-4 relative z-10">
                <h2 className="text-[12px] font-mono tracking-[0.6em] uppercase text-brand-gold font-black">AI_CREATIVE_ENGINE_SYNC</h2>
                <p className="text-[13px] font-mono text-white/90 uppercase tracking-widest min-h-[3em] leading-relaxed font-bold">
                  {loadingMessage || "Synthesizing visual logic..."}
                </p>
              </div>

              <div className="mt-8 h-[2px] bg-white/5 rounded-full overflow-hidden relative z-10">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: "100%" }}
                  transition={{ duration: 15, ease: "linear" }}
                  className="h-full bg-brand-gold shadow-[0_0_20px_rgba(255,255,255,0.5)]"
                />
              </div>
              
              <div className="mt-6 flex flex-col items-center gap-1 opacity-40 relative z-10">
                 <p className="text-[9px] font-mono text-white uppercase tracking-[0.3em] font-medium">Genvyd Architecture Protocol 8a</p>
                 <p className="text-[8px] font-mono text-brand-gold uppercase tracking-[0.2em]">Bypassing Standard Visual Latency</p>
                 <button 
                  onClick={() => setLoading(false)}
                  className="mt-4 text-[7px] font-mono text-white/20 hover:text-white/40 uppercase tracking-widest underline decoration-white/10"
                 >
                   Emergency Bypass
                 </button>
              </div>
            </motion.div>
          </div>
        </div>
      )}
    </div>
  );
}
