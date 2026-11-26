"use client";

import { PRIORITIES, priorityConfig } from "../priority";
import type { LabelInfo } from "@/features/labels/schema";
import { cn } from "@/lib/utils";
import { statusDotClass } from "@/features/projects/status-colors";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ListFilter, Search, X } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { useTaskFilters } from "../use-task-filters";

const ANY = "any";

/**
 * Filters for the project views. Everything lives in the URL
 * (?assignee=me&priority=high&due=week&q=…), so a filtered view can be
 * shared and survives a reload; switching board/list/table keeps it.
 */
export function TaskFilterBar({
  members,
  currentUserId,
  labels = [],
  showApproval = false,
}: {
  members: { id: string; name: string }[];
  currentUserId: string;
  /** The workspace's labels; the filter shows only when there are some. */
  labels?: LabelInfo[];
  /** Some task here has a client approval round (C3); the filter shows when so, or when it's set. */
  showApproval?: boolean;
}) {
  const { filters, active, setFilter, clear } = useTaskFilters();
  // Local text so typing stays smooth; the URL follows shortly after. The
  // URL only overrides the box when it changed from elsewhere (a shared
  // link, Back, "Clear filters"), never with an older value we wrote
  // ourselves while the user kept typing.
  const [text, setText] = useState(filters.q);
  const [lastUrlQ, setLastUrlQ] = useState(filters.q);
  const [written, setWritten] = useState<string | null>(null);
  if (filters.q !== lastUrlQ) {
    setLastUrlQ(filters.q);
    if (filters.q !== written) setText(filters.q);
  }
  useEffect(() => {
    const value = text.trim();
    if (value === filters.q) return;
    const t = setTimeout(() => {
      setWritten(value);
      setFilter("q", value || null);
    }, 200);
    return () => clearTimeout(t);
  }, [text, filters.q, setFilter]);

  // Phones: the three selects fold behind a "Filters" toggle so the bar
  // stays one row; from sm up they are always shown inline.
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const selectCount = [filters.assignee, filters.priority, filters.due, filters.label, filters.approval].filter(
    Boolean,
  ).length;

  const others = members
    .filter((m) => m.id !== currentUserId)
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div
      role="search"
      aria-label="Filter tasks"
      className="flex flex-wrap items-center gap-2"
    >
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          type="search"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Filter tasks…"
          aria-label="Filter by text"
          className="h-8 w-44 pl-8 text-sm sm:w-56"
        />
      </div>

      <Button
        variant="outline"
        size="sm"
        className="sm:hidden"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
      >
        <ListFilter />
        Filters{selectCount > 0 && ` (${selectCount})`}
      </Button>

      <div
        id={panelId}
        className={`${open ? "flex" : "hidden"} w-full flex-wrap items-center gap-2 sm:flex sm:w-auto`}
      >
        <Select
          value={filters.assignee ?? ANY}
          onValueChange={(v) => setFilter("assignee", v === ANY ? null : v)}
        >
          <SelectTrigger
            size="sm"
            className="h-8 w-auto min-w-36 text-sm"
            aria-label="Assignee"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Anyone</SelectItem>
            <SelectItem value="me">Assigned to me</SelectItem>
            <SelectItem value="unassigned">Unassigned</SelectItem>
            {others.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.priority ?? ANY}
          onValueChange={(v) => setFilter("priority", v === ANY ? null : v)}
        >
          <SelectTrigger
            size="sm"
            className="h-8 w-auto min-w-32 text-sm"
            aria-label="Priority"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Any priority</SelectItem>
            {PRIORITIES.map((p) => (
              <SelectItem key={p} value={p}>
                {priorityConfig[p].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.due ?? ANY}
          onValueChange={(v) => setFilter("due", v === ANY ? null : v)}
        >
          <SelectTrigger
            size="sm"
            className="h-8 w-auto min-w-32 text-sm"
            aria-label="Due date"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Any due date</SelectItem>
            <SelectItem value="overdue">Overdue</SelectItem>
            <SelectItem value="week">Due this week</SelectItem>
            <SelectItem value="none">No due date</SelectItem>
          </SelectContent>
        </Select>

        {labels.length > 0 && (
          <Select
            value={filters.label ?? ANY}
            onValueChange={(v) => setFilter("label", v === ANY ? null : v)}
          >
            <SelectTrigger
              size="sm"
              className="h-8 w-auto min-w-28 text-sm"
              aria-label="Label"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>Any label</SelectItem>
              {labels.map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  <span className="flex items-center gap-2">
                    <span className={cn("size-2 rounded-full", statusDotClass(l.color))} aria-hidden />
                    {l.name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {(showApproval || filters.approval) && (
          <Select
            value={filters.approval ?? ANY}
            onValueChange={(v) => setFilter("approval", v === ANY ? null : v)}
          >
            <SelectTrigger
              size="sm"
              className="h-8 w-auto min-w-36 text-sm"
              aria-label="Approval"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>Any approval</SelectItem>
              <SelectItem value="pending">Waiting on client</SelectItem>
              <SelectItem value="changes_requested">Changes requested</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>

      {active && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setWritten("");
            setText("");
            clear();
          }}
        >
          <X />
          Clear filters
        </Button>
      )}
    </div>
  );
}
