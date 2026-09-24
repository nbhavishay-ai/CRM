'use client';

import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Plus,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Users,
  Trash2,
  RefreshCw,
  Flame,
} from 'lucide-react';
import { AssignTaskModal } from './AssignTaskModal';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { useCrmSync, emitCrmSync } from '@/lib/sync-event';

interface TaskRecord {
  id: string;
  title: string;
  description?: string | null;
  priority: string;
  dueDate: string;
  dueTime: string;
  status: string;
  completedAt?: string | null;
  assignee: {
    id: string;
    name: string;
    email: string;
    designation?: string | null;
  };
  createdBy: {
    id: string;
    name: string;
    role: string;
  };
}

interface TasksOverviewData {
  tasks: TaskRecord[];
  stats: {
    total: number;
    completed: number;
    overdue: number;
    pending: number;
    completionRate: number;
  };
}

import { getFastCache, setFastCache } from '@/lib/fast-data';

interface AdminTasksOverviewWidgetProps {
  role?: 'ADMIN' | 'HR';
}

export const AdminTasksOverviewWidget: React.FC<AdminTasksOverviewWidgetProps> = ({
  role = 'ADMIN',
}) => {
  const cacheKey = `crm:tasks:overview:${role}`;

  const [data, setData] = useState<TasksOverviewData | null>(null);
  const [loading, setLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [taskToDelete, setTaskToDelete] = useState<TaskRecord | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchTasksData = async (isBackground: boolean | unknown = false) => {
    const isBg = isBackground === true;
    const cached = getFastCache<TasksOverviewData>(cacheKey);
    if (!cached && !isBg) {
      setLoading(true);
    }
    try {
      const res = await fetch('/api/tasks');
      const json = await res.json();
      if (json.tasks) {
        setData(json);
        setFastCache(cacheKey, json, 60000);
      }
    } catch (err) {
      console.error('Failed to fetch tasks overview:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const cached = getFastCache<TasksOverviewData>(cacheKey);
    if (cached) {
      setData(cached);
      setLoading(false);
      fetchTasksData(true);
    } else {
      fetchTasksData(false);
    }
  }, []);

  useCrmSync(['tasks', 'all'], () => {
    fetchTasksData(true);
  });

  const handleConfirmDeleteTask = async () => {
    if (!taskToDelete) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/tasks/${taskToDelete.id}`, { method: 'DELETE' });
      if (res.ok) {
        emitCrmSync('tasks');
        setTaskToDelete(null);
        fetchTasksData(true);
      }
    } catch (err) {
      console.error('Error deleting task:', err);
    } finally {
      setIsDeleting(false);
    }
  };

  const formatDueTime = (timeStr: string) => {
    if (!timeStr) return '';
    const [hours, minutes] = timeStr.split(':').map(Number);
    if (isNaN(hours)) return timeStr;
    const period = hours >= 12 ? 'PM' : 'AM';
    const formattedHours = hours % 12 === 0 ? 12 : hours % 12;
    return `${formattedHours}:${String(minutes).padStart(2, '0')} ${period}`;
  };

  const stats = data?.stats || {
    total: 0,
    completed: 0,
    overdue: 0,
    pending: 0,
    completionRate: 0,
  };

  return (
    <div className="rounded-2xl bg-white border border-[#E5E5E0] shadow-xs overflow-hidden">
      {/* Header Banner */}
      <div className="p-4 sm:p-5 border-b border-[#E5E5E0] bg-[#FCFCFA] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#111314] text-[#D2BE91] flex items-center justify-center shadow-xs">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-[#171817]">
                Executive Daily Tasks & Completion Tracker
              </h3>
              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-[#F4F4F1] text-[#626560] border border-[#E5E5E0]">
                {role === 'HR' ? 'HR Workforce' : 'Admin Control'}
              </span>
            </div>
            <p className="text-xs text-[#626560] mt-0.5">
              Directives assigned to all executives or specific team members with daily completion deadlines.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchTasksData}
            disabled={loading}
            title="Refresh"
            className="p-2 rounded-xl text-[#90928E] hover:text-[#171817] hover:bg-[#F4F4F1] transition border border-[#E5E5E0] cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <Button
            onClick={() => setIsModalOpen(true)}
            className="text-xs px-3.5 py-1.5 bg-[#111314] hover:bg-[#1E2021] text-[#F4F2EC] border border-[#252829] font-semibold inline-flex items-center gap-1.5 transition cursor-pointer shadow-xs"
          >
            <Plus className="w-3.5 h-3.5 text-[#D2BE91]" /> Assign Executive Task
          </Button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-[#E5E5E0] border-b border-[#E5E5E0] bg-white">
        <div className="p-3.5 text-center">
          <p className="text-[11px] font-semibold text-[#626560] flex items-center justify-center gap-1">
            <Users className="w-3 h-3 text-[#B69A63]" /> Total Assigned Today
          </p>
          <p className="text-xl font-black text-[#171817] mt-1">{stats.total}</p>
        </div>

        <div className="p-3.5 text-center">
          <p className="text-[11px] font-semibold text-[#2D5A3C] flex items-center justify-center gap-1">
            <CheckCircle2 className="w-3 h-3 text-[#2D5A3C]" /> Completed
          </p>
          <p className="text-xl font-black text-[#2D5A3C] mt-1">{stats.completed}</p>
        </div>

        <div className="p-3.5 text-center">
          <p className="text-[11px] font-semibold text-[#7A5B28] flex items-center justify-center gap-1">
            <Clock className="w-3 h-3 text-[#B69A63]" /> Pending
          </p>
          <p className="text-xl font-black text-[#171817] mt-1">{stats.pending}</p>
        </div>

        <div className="p-3.5 text-center">
          <p className="text-[11px] font-semibold text-[#B42318] flex items-center justify-center gap-1">
            <AlertTriangle className="w-3 h-3 text-[#B42318]" /> Overdue
          </p>
          <p className="text-xl font-black text-[#B42318] mt-1">{stats.overdue}</p>
        </div>
      </div>

      {/* Tasks Table / List */}
      <div className="overflow-x-auto">
        {loading && !data ? (
          <div className="p-8 text-center text-xs text-[#626560]">Loading tasks...</div>
        ) : !data || data.tasks.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-xs font-bold text-[#171817]">No Tasks Assigned Today</p>
            <p className="text-[11px] text-[#626560] mt-1">
              Click &ldquo;Assign Executive Task&rdquo; to broadcast a daily target or instruct a specific executive.
            </p>
          </div>
        ) : (
          <table className="w-full text-left text-xs">
            <thead className="bg-[#F8F8F6] text-[#626560] border-b border-[#E5E5E0] font-semibold">
              <tr>
                <th className="py-2.5 px-4">Executive</th>
                <th className="py-2.5 px-4">Task Directive</th>
                <th className="py-2.5 px-4">Priority</th>
                <th className="py-2.5 px-4">Deadline</th>
                <th className="py-2.5 px-4">Status</th>
                <th className="py-2.5 px-4">Assigned By</th>
                <th className="py-2.5 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E5E0]">
              {data.tasks.map((task) => {
                const isOverdue = task.status === 'OVERDUE';
                const isCompleted = task.status === 'COMPLETED';

                return (
                  <tr key={task.id} className="hover:bg-[#FAFAF9] transition">
                    <td className="py-3 px-4 font-semibold text-[#171817]">
                      {task.assignee.name}
                      <span className="block text-[10px] font-normal text-[#90928E]">
                        {task.assignee.email}
                      </span>
                    </td>

                    <td className="py-3 px-4 max-w-xs">
                      <p className="font-semibold text-[#171817] truncate">{task.title}</p>
                      {task.description && (
                        <p className="text-[11px] text-[#626560] truncate mt-0.5">
                          {task.description}
                        </p>
                      )}
                    </td>

                    <td className="py-3 px-4">
                      {task.priority === 'HIGH' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#FFF1F0] text-[#B42318] border border-[#FECDCA]">
                          <Flame className="w-3 h-3 text-[#B42318]" /> High
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#F4F4F1] text-[#626560] border border-[#E5E5E0]">
                          Normal
                        </span>
                      )}
                    </td>

                    <td className="py-3 px-4 text-[#171817] font-medium">
                      {formatDueTime(task.dueTime)}
                    </td>

                    <td className="py-3 px-4">
                      {isCompleted ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#EDF5F0] text-[#2D5A3C] border border-[#D3E5D9]">
                          <CheckCircle2 className="w-3 h-3 text-[#2D5A3C]" /> Completed
                        </span>
                      ) : isOverdue ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#FFF1F0] text-[#B42318] border border-[#FECDCA]">
                          <AlertTriangle className="w-3 h-3 text-[#B42318]" /> Overdue
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-[#FDF8EE] text-[#7A5B28] border border-[#EAD9B8]">
                          <Clock className="w-3 h-3 text-[#B69A63]" /> Pending
                        </span>
                      )}
                    </td>

                    <td className="py-3 px-4 text-[#626560] text-[11px]">
                      {task.createdBy.role === 'HR' ? 'HR' : 'Admin'} ({task.createdBy.name})
                    </td>

                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => setTaskToDelete(task)}
                        title="Delete Task"
                        className="p-1 rounded-lg text-[#90928E] hover:text-[#B42318] hover:bg-[#FFF1F0] transition cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal */}
      <AssignTaskModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={fetchTasksData}
      />

      {/* Delete Confirmation Modal */}
      {taskToDelete && (
        <Modal
          isOpen={true}
          onClose={() => setTaskToDelete(null)}
          title="Cancel & Delete Task"
        >
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-3.5 bg-red-50 border border-red-200 rounded-xl text-red-900">
              <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <div className="text-xs space-y-1">
                <p className="font-bold text-sm">
                  Cancel task &ldquo;{taskToDelete.title}&rdquo;?
                </p>
                <p className="text-red-700">
                  This task assigned to <strong className="text-red-900">{taskToDelete.assignee.name}</strong> will be permanently removed from their daily checklist.
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-[#E5E5E0]">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setTaskToDelete(null)}
                disabled={isDeleting}
              >
                Keep Task
              </Button>
              <Button
                type="button"
                variant="danger"
                onClick={handleConfirmDeleteTask}
                isLoading={isDeleting}
              >
                Delete Task
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
