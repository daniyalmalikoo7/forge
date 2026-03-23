"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ExplorerView } from "@/components/explorer/ExplorerView";
import { getProject, type Project } from "@/lib/api";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "success" | "warning" | "info"> = {
  created: "secondary",
  exploring: "info",
  explored: "success",
  designing: "info",
  designed: "success",
  building: "info",
  built: "success",
};

export default function ProjectPage() {
  const params = useParams();
  const projectId = params.id as string;
  const [project, setProject] = useState<Project | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [liveStatus, setLiveStatus] = useState<string | null>(null);

  useEffect(() => {
    getProject(projectId)
      .then(setProject)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Failed to load project"));
  }, [projectId]);

  // 13. Real-time status update from ExplorerView
  const handleStatusChange = useCallback((status: string) => {
    setLiveStatus(status);
  }, []);

  if (error) {
    return <p className="text-red-500">{error}</p>;
  }

  if (!project) {
    return <p className="text-slate-500">Loading project...</p>;
  }

  const displayStatus = liveStatus ?? project.status;

  return (
    <div className="flex flex-col gap-6">
      {/* 12. Full title wrapping */}
      <div className="flex flex-wrap items-start gap-3">
        <h1 className="text-2xl font-bold leading-tight">{project.name}</h1>
        <Badge variant={STATUS_VARIANT[displayStatus] ?? "secondary"}>
          {displayStatus}
        </Badge>
      </div>

      <Tabs defaultValue="discovery">
        <TabsList>
          <TabsTrigger value="discovery">Discovery</TabsTrigger>
          <TabsTrigger value="design" disabled>Design</TabsTrigger>
          <TabsTrigger value="code" disabled>Code</TabsTrigger>
        </TabsList>

        <TabsContent value="discovery">
          <ExplorerView
            projectId={projectId}
            projectStatus={project.status}
            onStatusChange={handleStatusChange}
          />
        </TabsContent>

        <TabsContent value="design">
          <p className="py-8 text-center text-slate-400">Coming in System 2</p>
        </TabsContent>

        <TabsContent value="code">
          <p className="py-8 text-center text-slate-400">Coming in System 3</p>
        </TabsContent>
      </Tabs>
    </div>
  );
}
