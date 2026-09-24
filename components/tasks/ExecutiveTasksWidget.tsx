'use client';

import React, { useState, useEffect } from 'react';
import {
  CheckCircle2,
  Circle,
  Clock,
  AlertTriangle,
  Flame,
  Calendar,
  Sparkles,
  CheckCircle,
  ShieldCheck,
  UserCheck,
  RefreshCw,
} from 'lucide-react';
import { ExecutiveTaskItem } from '@/types';
import { emitCrmSync, useCrmSync } from '@/lib/sync-event';
import { getFastCache, setFastCache } from '@/lib/fast-data';

interface ExecutiveTasksWidgetProps {
  initialTasks?: ExecutiveTaskItem[];
  userId?: string;
}

export const ExecutiveTasksWidget: React.FC<ExecutiveTasksWidgetProps> = ({
  initialTasks = [],
}) => {
  const cacheKey = 'crm:tasks:today';

  const [tasks, setTasks] = useState<ExecutiveTaskItem[]>(() => {
    if (initialTasks.length > 0) return initialTasks;
    return getFastCache<ExecutiveTaskItem[]>(cacheKey) || [];
  });
  const [loading, setLoading] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const fetchTodayTasks = async (isBackground: boolean | unknown = false) => {
    const isBg = isBackground === true;
    if (!isBg && tasks.length === 0) setLoading(true);
    try {
      const res = await fetch('/api/tasks');
      const data = await res.json();
      if (data.tasks && Array.isArray(data.tasks)) {
        setTasks(data.tasks);
        setFastCache(cacheKey, data.tasks, 60000);
      }
    } catch (err) {
      console.error('Failed to fetch today tasks:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const cached = getFastCache<ExecutiveTaskItem[]>(cacheKey);
    if (cached) {
      setTasks(cached);
      fetchTodayTasks(true);
    } else {
      fetchTodayTasks(false);
    }
  }, []);

  useCrmSync(['tasks', 'all'], () => {
    fetchTodayTasks(true);
  });

  // Toggle completion
  const handleToggleTask = async (task: ExecutiveTaskItem) => {
    const isCurrentlyCompleted = task.status === 'COMPLETED';
    const newStatus = isCurrentlyCompleted ? 'PENDING' : 'COMPLETED';
    const newCompletedAt = isCurrentlyCompleted ? null : new Date().toISOString();

    // Optimistic update
    setTasks((prev) => {
      const next = prev.map((t) =>
        t.id === task.id
          ? { ...t, status: newStatus, completedAt: newCompletedAt }
          : t
      );
      setFastCache(cacheKey, next, 60000);
      return next;
    });

    emitCrmSync('tasks');

    setUpdatingId(task.id);
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!res.ok) {
        // Revert on failure
        setTasks((prev) =>
          prev.map((t) => (t.id === task.id ? task : t))
        );
      } else {
        const data = await res.json();
        if (data.task) {
          setTasks((prev) =>
            prev.map((t) => (t.id === task.id ? data.task : t))
          );
        }
        emitCrmSync('tasks');
      }
    } catch (err) {
      console.error('Error toggling task:', err);
      // Revert on error
      setTasks((prev) => prev.map((t) => (t.id === task.id ? task : t)));
    } finally {
      setUpdatingId(null);
    }
  };

  // Helper to format due time into 12-hour AM/PM format
  const formatDueTime = (timeStr: string) => {
    if (!timeStr) return '';
    const [hours, minutes] = timeStr.split(':').map(Number);
    if (isNaN(hours)) return timeStr;
    const period = hours >= 12 ? 'PM' : 'AM';
    const formattedHours = hours % 12 === 0 ? 12 : hours % 12;
    return `${formattedHours}:${String(minutes).padStart(2, '0')} ${period}`;
  };

  // Helper to calculate time remaining or overdue
  const getTimeBadge = (task: ExecutiveTaskItem) => {
    if (task.status === 'COMPLETED') {
      const completedTime = task.completedAt
        ? new Date(task.completedAt).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })
        : null;
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#EDF5F0] text-[#2D5A3C] border border-[#D3E5D9]">
          <CheckCircle className="w-3 h-3 text-[#2D5A3C]" />
          Completed {completedTime ? `at ${completedTime}` : ''}
        </span>
      );
    }

    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const [dueH, dueM] = task.dueTime.split(':').map(Number);
    const deadlineDate = new Date();
    deadlineDate.setHours(dueH || 18, dueM || 0, 0, 0);

    const isPastDate = task.dueDate < todayStr;
    const isPastTime = task.dueDate === todayStr && now.getTime() > deadlineDate.getTime();

    if (isPastDate || isPastTime || task.status === 'OVERDUE') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#FFF1F0] text-[#B42318] border border-[#FECDCA] animate-pulse">
          <AlertTriangle className="w-3 h-3 text-[#B42318]" />
          OVERDUE (Due {formatDueTime(task.dueTime)})
        </span>
      );
    }

    // Time remaining today
    const diffMs = deadlineDate.getTime() - now.getTime();
    const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    let countdownStr = '';
    if (diffHrs > 0) {
      countdownStr = `${diffHrs}h ${diffMins}m remaining`;
    } else {
      countdownStr = `${diffMins}m remaining`;
    }

    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-[#FDF8EE] text-[#7A5B28] border border-[#EAD9B8]">
        <Clock className="w-3 h-3 text-[#B69A63]" />
        Due by {formatDueTime(task.dueTime)} ({countdownStr})
      </span>
    );
  };

  const total = tasks.length;
  const completed = tasks.filter((t) => t.status === 'COMPLETED').length;
  const overdue = tasks.filter((t) => t.status === 'OVERDUE').length;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div className="rounded-2xl bg-white border border-[#E5E5E0] shadow-xs overflow-hidden">
      {/* Header Banner */}
      <div className="p-4 sm:p-5 border-b border-[#E5E5E0] bg-gradient-to-r from-white via-[#FCFCFA] to-[#F8F8F6] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#111314] text-[#D2BE91] flex items-center justify-center shadow-xs">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-[#171817]">
                Today&apos;s Assigned Directives & Deadlines
              </h3>
              {overdue > 0 && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#FFF1F0] text-[#B42318] border border-[#FECDCA]">
                  {overdue} Overdue
                </span>
              )}
            </div>
            <p className="text-xs text-[#626560] mt-0.5">
              Daily operational tasks assigned by Administration & HR to complete today.
            </p>
          </div>
        </div>

        {/* Progress Badge and Refresh */}
        <div className="flex items-center gap-3 self-start sm:self-auto">
          {total > 0 && (
            <div className="flex items-center gap-2">
              <div className="text-right">
                <p className="text-xs font-bold text-[#171817]">
                  {completed} of {total} Completed
                </p>
                <p className="text-[10px] text-[#7A5B28] font-medium">{percent}% daily goal</p>
              </div>
              <div className="w-16 sm:w-24 h-2 rounded-full bg-[#E5E5E0] overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#B69A63] to-[#2D5A3C] transition-all duration-500"
                  style={{ width: `${percent}%` }}
                />
              </div>
            </div>
          )}

          <button
            onClick={fetchTodayTasks}
            disabled={loading}
            title="Refresh tasks"
            className="p-1.5 rounded-lg text-[#90928E] hover:text-[#171817] hover:bg-[#F4F4F1] transition cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Task List */}
      <div className="divide-y divide-[#E5E5E0]">
        {tasks.length === 0 ? (
          <div className="p-8 text-center">
            <div className="w-10 h-10 rounded-full bg-[#F4F4F1] text-[#90928E] flex items-center justify-center mx-auto mb-2">
              <CheckCircle2 className="w-5 h-5 text-[#2D5A3C]" />
            </div>
            <p className="text-xs font-bold text-[#171817]">No Pending Directives</p>
            <p className="text-[11px] text-[#626560] mt-1">
              You are all caught up! No daily tasks have been assigned to you today.
            </p>
          </div>
        ) : (
          tasks.map((task) => {
            const isDone = task.status === 'COMPLETED';
            const isUpdating = updatingId === task.id;

            return (
              <div
                key={task.id}
                className={`p-4 transition-colors flex items-start justify-between gap-3 ${
                  isDone ? 'bg-[#FAFAF9]/60' : 'hover:bg-[#FDFDFD]'
                }`}
              >
                {/* Left: Checkbox & Info */}
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <button
                    type="button"
                    onClick={() => handleToggleTask(task)}
                    disabled={isUpdating}
                    className="mt-0.5 shrink-0 text-[#171817] hover:opacity-80 transition cursor-pointer"
                    title={isDone ? 'Mark as pending' : 'Mark as completed'}
                  >
                    {isDone ? (
                      <CheckCircle2 className="w-5 h-5 text-[#2D5A3C] fill-[#EDF5F0]" />
                    ) : (
                      <Circle className="w-5 h-5 text-[#90928E] hover:text-[#B69A63]" />
                    )}
                  </button>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p
                        className={`text-xs font-bold transition-all ${
                          isDone
                            ? 'line-through text-[#90928E]'
                            : 'text-[#171817]'
                        }`}
                      >
                        {task.title}
                      </p>

                      {/* Priority Tag */}
                      {task.priority === 'HIGH' && (
                        <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#FFF1F0] text-[#B42318] border border-[#FECDCA]">
                          <Flame className="w-3 h-3 text-[#B42318]" /> High Priority
                        </span>
                      )}

                      {/* Creator badge */}
                      {task.createdBy && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-[#626560] bg-[#F4F4F1] px-2 py-0.5 rounded-md border border-[#E5E5E0]">
                          <ShieldCheck className="w-3 h-3 text-[#B69A63]" />
                          Assigned by {task.createdBy.role === 'HR' ? 'HR' : 'Admin'} (
                          {task.createdBy.name})
                        </span>
                      )}
                    </div>

                    {task.description && (
                      <p className="text-[11px] text-[#626560] mt-1 leading-relaxed whitespace-pre-line">
                        {task.description}
                      </p>
                    )}
                  </div>
                </div>

                {/* Right: Deadline Badge */}
                <div className="shrink-0 flex items-center">{getTimeBadge(task)}</div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
