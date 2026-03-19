export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      projects: {
        Row: {
          id: string;
          name: string;
          slug: string;
          owner_id: string;
          problem_statement: string;
          status: "created" | "exploring" | "explored" | "designing" | "designed" | "building" | "built";
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          owner_id: string;
          problem_statement: string;
          status?: "created" | "exploring" | "explored" | "designing" | "designed" | "building" | "built";
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          owner_id?: string;
          problem_statement?: string;
          status?: "created" | "exploring" | "explored" | "designing" | "designed" | "building" | "built";
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      discovery_documents: {
        Row: {
          id: string;
          project_id: string;
          version: number;
          status: "draft" | "pending_review" | "approved" | "sealed" | "superseded";
          document: Json;
          overall_confidence: number | null;
          has_blockers: boolean;
          created_at: string;
          sealed_at: string | null;
        };
        Insert: {
          id?: string;
          project_id: string;
          version?: number;
          status?: "draft" | "pending_review" | "approved" | "sealed" | "superseded";
          document: Json;
          overall_confidence?: number | null;
          has_blockers?: boolean;
          created_at?: string;
          sealed_at?: string | null;
        };
        Update: {
          id?: string;
          project_id?: string;
          version?: number;
          status?: "draft" | "pending_review" | "approved" | "sealed" | "superseded";
          document?: Json;
          overall_confidence?: number | null;
          has_blockers?: boolean;
          created_at?: string;
          sealed_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "discovery_documents_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      agent_runs: {
        Row: {
          id: string;
          project_id: string;
          discovery_document_id: string | null;
          agent_name: string;
          status: "running" | "complete" | "failed";
          input: Json | null;
          output: Json | null;
          confidence: number | null;
          flags: Json;
          error: string | null;
          started_at: string;
          completed_at: string | null;
        };
        Insert: {
          id?: string;
          project_id: string;
          discovery_document_id?: string | null;
          agent_name: string;
          status?: "running" | "complete" | "failed";
          input?: Json | null;
          output?: Json | null;
          confidence?: number | null;
          flags?: Json;
          error?: string | null;
          started_at?: string;
          completed_at?: string | null;
        };
        Update: {
          id?: string;
          project_id?: string;
          discovery_document_id?: string | null;
          agent_name?: string;
          status?: "running" | "complete" | "failed";
          input?: Json | null;
          output?: Json | null;
          confidence?: number | null;
          flags?: Json;
          error?: string | null;
          started_at?: string;
          completed_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "agent_runs_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "agent_runs_discovery_document_id_fkey";
            columns: ["discovery_document_id"];
            isOneToOne: false;
            referencedRelation: "discovery_documents";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
