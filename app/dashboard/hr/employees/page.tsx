'use client';

import React, { useState, useEffect } from 'react';
import {
  Users,
  Search,
  Plus,
  Mail,
  Phone,
  Building,
  CheckCircle2,
  XCircle,
  ToggleLeft,
  ToggleRight,
  Shield,
  Edit2,
  Lock,
  Download,
  DollarSign,
  AlertCircle,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { generateCSV, downloadCSV, ExportColumn } from '@/lib/export-utils';
import { emitCrmSync, useCrmSync } from '@/lib/sync-event';
import {
  mergeUsersWithResilience,
  upsertCachedUser,
  markUsersAsDeleted,
} from '@/lib/client-cache';

interface Employee {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  role: string;
  designation?: string | null;
  department?: string | null;
  dateOfJoining?: string | null;
  baseSalary?: number | null;
  emergencyContact?: string | null;
  active: boolean;
  routingAvailable: boolean;
  team?: { id: string; name: string } | null;
  todayAttendance?: {
    status: string;
    clockIn?: string | null;
    clockOut?: string | null;
  } | null;
}

export default function StaffDirectoryPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [department, setDepartment] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Add Form states
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    role: 'EXECUTIVE',
    phone: '',
    designation: '',
    department: 'Sales',
    baseSalary: '35000',
    emergencyContact: '',
  });

  // Edit Form state
  const [editFormData, setEditFormData] = useState({
    name: '',
    phone: '',
    designation: '',
    department: 'Sales',
    baseSalary: '35000',
    emergencyContact: '',
  });

  const fetchEmployees = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      if (department) params.set('department', department);
      params.set('t', Date.now().toString());

      const res = await fetch(`/api/hr/employees?${params.toString()}`, { cache: 'no-store' });
      if (res.ok) {
        const json = await res.json();
        const nonAdmin = (json.employees || []).filter((e: Employee) => e.role !== 'ADMIN');
        setEmployees((prev) => mergeUsersWithResilience(nonAdmin, prev).filter((e) => e.role !== 'ADMIN'));
      }
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmployees(true);
    const interval = setInterval(() => {
      fetchEmployees(false);
    }, 6000);
    return () => clearInterval(interval);
  }, [search, department]);

  useCrmSync(['users', 'hr', 'all'], () => {
    fetchEmployees(false);
  });

  const handleToggleRouting = async (employee: Employee) => {
    const updatedStatus = !employee.routingAvailable;
    const optimistic = { ...employee, routingAvailable: updatedStatus };
    upsertCachedUser(optimistic as any);
    setEmployees((prev) => mergeUsersWithResilience([optimistic], prev));
    try {
      const res = await fetch('/api/hr/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'UPDATE', id: employee.id, routingAvailable: updatedStatus }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to update routing availability');
      emitCrmSync('users');
    } catch (error) {
      setEmployees((prev) => mergeUsersWithResilience([employee], prev));
      setAddError(error instanceof Error ? error.message : 'Failed to update routing availability');
    }
  };

  const handleToggleActive = async (employee: Employee) => {
    const updatedActive = !employee.active;
    const optimistic = { ...employee, active: updatedActive };
    upsertCachedUser(optimistic as any);
    setEmployees((prev) => mergeUsersWithResilience([optimistic], prev));
    try {
      const res = await fetch('/api/hr/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'UPDATE', id: employee.id, active: updatedActive }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to update employee status');
      emitCrmSync('users');
    } catch (error) {
      setEmployees((prev) => mergeUsersWithResilience([employee], prev));
      setAddError(error instanceof Error ? error.message : 'Failed to update employee status');
    }
  };

  const handleAddEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError(null);
    try {
      const res = await fetch('/api/hr/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          baseSalary: parseFloat(formData.baseSalary) || 0,
        }),
      });

      const json = await res.json();
      if (res.ok) {
        if (json.employee) {
          upsertCachedUser(json.employee);
          setEmployees((prev) => mergeUsersWithResilience([json.employee], prev));
        }
        setIsAddModalOpen(false);
        setFormData({
          name: '',
          email: '',
          role: 'EXECUTIVE',
          phone: '',
          designation: '',
          department: 'Sales',
          baseSalary: '35000',
          emergencyContact: '',
        });
        emitCrmSync('users', json.employee);
        fetchEmployees(false);
      } else {
        setAddError(json.error || 'Failed to create employee');
      }
    } catch (err: unknown) {
      setAddError(err instanceof Error ? err.message : 'Failed to create employee');
    }
  };

  const openEditModal = (emp: Employee) => {
    setEditingEmployee(emp);
    setEditFormData({
      name: emp.name || '',
      phone: emp.phone || '',
      designation: emp.designation || '',
      department: emp.department || 'Sales',
      baseSalary: emp.baseSalary ? String(emp.baseSalary) : '35000',
      emergencyContact: emp.emergencyContact || '',
    });
    setEditError(null);
  };

  const handleSaveEditEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEmployee) return;
    setSavingEdit(true);
    setEditError(null);
    try {
      const res = await fetch('/api/hr/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'UPDATE',
          id: editingEmployee.id,
          name: editFormData.name,
          phone: editFormData.phone,
          designation: editFormData.designation,
          department: editFormData.department,
          baseSalary: parseFloat(editFormData.baseSalary) || 0,
          emergencyContact: editFormData.emergencyContact,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Failed to update employee details');
      }

      if (json.employee) {
        upsertCachedUser(json.employee);
        setEmployees((prev) => mergeUsersWithResilience([json.employee], prev));
      }

      setEditingEmployee(null);
      emitCrmSync('users', json.employee);
      fetchEmployees(false);
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : 'Error updating employee');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleExportCSV = () => {
    type EmployeeExportItem = {
      name: string;
      email: string;
      role: string;
      designation: string;
      department: string;
      phone: string;
      baseSalary: number;
      emergencyContact: string;
      teamName: string;
      status: string;
      routingStatus: string;
    };

    const columns: ExportColumn<EmployeeExportItem>[] = [
      { header: 'Employee Name', accessor: (e) => e.name },
      { header: 'Email', accessor: (e) => e.email },
      { header: 'Role', accessor: (e) => e.role },
      { header: 'Designation', accessor: (e) => e.designation },
      { header: 'Department', accessor: (e) => e.department },
      { header: 'Phone', accessor: (e) => e.phone },
      { header: 'Base Salary (INR)', accessor: (e) => e.baseSalary },
      { header: 'Emergency Contact', accessor: (e) => e.emergencyContact },
      { header: 'Assigned Team', accessor: (e) => e.teamName },
      { header: 'Account Status', accessor: (e) => e.status },
      { header: 'Lead Routing', accessor: (e) => e.routingStatus },
    ];

    const exportData: EmployeeExportItem[] = employees.map((e) => ({
      name: e.name,
      email: e.email,
      role: e.role,
      designation: e.designation || 'Staff',
      department: e.department || 'General',
      phone: e.phone || '',
      baseSalary: e.baseSalary || 0,
      emergencyContact: e.emergencyContact || '',
      teamName: e.team?.name || 'Unassigned',
      status: e.active ? 'ACTIVE' : 'DEACTIVATED',
      routingStatus: e.routingAvailable ? 'ACTIVE' : 'PAUSED',
    }));

    const csvContent = generateCSV(exportData, columns);
    downloadCSV(`staff-roster-${new Date().toISOString().split('T')[0]}.csv`, csvContent);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#E5E5E0]">
        <div>
          <h2 className="text-xl font-bold text-[#171817] flex items-center gap-2">
            <Users className="w-5 h-5 text-[#B69A63]" /> Employee &amp; Staff Directory
          </h2>
          <p className="text-xs text-[#626560] mt-1">
            Complete workforce profiles, compensation details, and lead routing availability control.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button onClick={handleExportCSV} variant="secondary" size="sm">
            <Download className="w-3.5 h-3.5 mr-1" /> Export Staff CSV
          </Button>

          <Button onClick={() => setIsAddModalOpen(true)} size="sm" variant="primary">
            <Plus className="w-3.5 h-3.5 mr-1" /> Add Employee
          </Button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="p-4 rounded-2xl bg-white border border-[#E5E5E0] shadow-xs flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-[#8C908A] absolute left-3 top-2.5" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search employee by name, email, or designation..."
            className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-white border border-[#E5E5E0] text-[#171817] placeholder-[#8C908A] focus:outline-none focus:border-[#B69A63]"
          />
        </div>

        <select
          value={department}
          onChange={(e) => setDepartment(e.target.value)}
          className="px-3 py-2 text-xs rounded-xl bg-white border border-[#E5E5E0] text-[#171817] focus:outline-none focus:border-[#B69A63]"
        >
          <option value="">All Departments</option>
          <option value="Sales">Sales</option>
          <option value="Human Resources">Human Resources</option>
          <option value="Operations">Operations</option>
          <option value="Management">Management</option>
        </select>
      </div>

      {/* Staff Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          <div className="col-span-full py-12 text-center text-xs text-[#8C908A]">
            Loading staff records...
          </div>
        ) : employees.length === 0 ? (
          <div className="col-span-full py-12 text-center text-xs text-[#8C908A]">
            No employees found matching filter.
          </div>
        ) : (
          employees.map((emp) => (
            <div
              key={emp.id}
              className={`rounded-2xl border p-5 transition bg-white shadow-xs ${
                emp.active
                  ? 'border-[#E5E5E0] hover:border-[#B69A63]'
                  : 'border-[#8C3333]/30 bg-[#FDF2F2]/30'
              }`}
            >
              {/* Top Row: Name & Role Badge */}
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-sm font-bold text-[#171817]">{emp.name}</h3>
                  <p className="text-xs font-medium text-[#B69A63] mt-0.5">
                    {emp.designation || 'Staff Member'}
                  </p>
                </div>

                <div className="flex items-center gap-1.5">
                  <span className="px-2.5 py-0.5 rounded-md text-[10px] font-bold bg-[#111314] text-[#F4F2EC] border border-[#26282B]">
                    {emp.role.replace('_', ' ')}
                  </span>
                  <button
                    onClick={() => openEditModal(emp)}
                    className="p-1 rounded-lg text-zinc-400 hover:text-zinc-800 hover:bg-zinc-100 transition-colors"
                    title="Edit Employee Details"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Department & Team */}
              <div className="mt-3 flex items-center gap-2 text-xs text-[#626560]">
                <Building className="w-3.5 h-3.5 text-[#8C908A]" />
                <span>{emp.department || 'General'}</span>
                {emp.team && (
                  <>
                    <span>•</span>
                    <span className="font-semibold text-[#171817]">{emp.team.name}</span>
                  </>
                )}
              </div>

              {/* Contact Info */}
              <div className="mt-3 space-y-1.5 text-xs text-[#626560] border-t border-[#F4F4F1] pt-3">
                <div className="flex items-center gap-2">
                  <Mail className="w-3.5 h-3.5 text-[#8C908A]" />
                  <span className="font-mono text-[11px] truncate">{emp.email}</span>
                </div>
                {emp.phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="w-3.5 h-3.5 text-[#8C908A]" />
                    <span>{emp.phone}</span>
                  </div>
                )}
                {emp.emergencyContact && (
                  <div className="text-[11px] text-zinc-500 italic">
                    Emergency: {emp.emergencyContact}
                  </div>
                )}
              </div>

              {/* Compensation */}
              <div className="mt-3 pt-3 border-t border-[#F4F4F1] flex items-center justify-between text-xs">
                <span className="text-[#8C908A]">Base Salary:</span>
                <span className="font-bold text-[#171817] font-mono tabular-nums">
                  ₹{(emp.baseSalary || 0).toLocaleString('en-IN')}/mo
                </span>
              </div>

              {/* Routing Availability Switch */}
              {emp.role === 'EXECUTIVE' && (
                <div className="mt-3 pt-3 border-t border-[#F4F4F1] flex items-center justify-between">
                  <span className="text-xs text-[#626560] flex items-center gap-1.5">
                    Lead Routing Available:
                  </span>
                  <button
                    type="button"
                    onClick={() => handleToggleRouting(emp)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer border ${
                      emp.routingAvailable
                        ? 'bg-[#F0F7F2] text-[#2D5A3C] border-[#2D5A3C]/20 hover:bg-[#E2F0E6]'
                        : 'bg-[#FDF2F2] text-[#8C3333] border-[#8C3333]/20 hover:bg-[#FBE6E6]'
                    }`}
                  >
                    {emp.routingAvailable ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5 text-[#2D5A3C]" /> Active in Round-Robin
                      </>
                    ) : (
                      <>
                        <XCircle className="w-3.5 h-3.5 text-[#8C3333]" /> Paused (Off-Duty/Leave)
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* Account Status Control */}
              <div className="mt-3 pt-3 border-t border-[#F4F4F1] flex items-center justify-between">
                <span className="text-[11px] text-[#8C908A]">Account Access:</span>
                <button
                  type="button"
                  onClick={() => handleToggleActive(emp)}
                  className={`text-[11px] font-semibold hover:underline cursor-pointer ${
                    emp.active ? 'text-[#8C3333]' : 'text-[#2D5A3C]'
                  }`}
                >
                  {emp.active ? 'Deactivate Account' : 'Reactivate Account'}
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add Employee Modal */}
      {isAddModalOpen && (
        <Modal
          isOpen={true}
          onClose={() => setIsAddModalOpen(false)}
          title="Onboard New Employee"
          subtitle="Enter employee credentials and HR profile details."
        >
          <form onSubmit={handleAddEmployee} className="space-y-3.5 text-xs">
            {addError && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 font-medium">
                {addError}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-[#171817] mb-1">Full Name *</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-[#E5E5E0] text-[#171817] focus:outline-none focus:border-[#B69A63]"
                  placeholder="e.g. Anand Trivedi"
                />
              </div>
              <div>
                <label className="block font-semibold text-[#171817] mb-1">Corporate Email *</label>
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-[#E5E5E0] text-[#171817] focus:outline-none focus:border-[#B69A63]"
                  placeholder="employee@orvion.com"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-[#171817] mb-1">Role *</label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-[#E5E5E0] text-[#171817] focus:outline-none focus:border-[#B69A63]"
                >
                  <option value="EXECUTIVE">Sales Executive</option>
                  <option value="TEAM_LEAD">Team Lead</option>
                </select>
              </div>
              <div>
                <label className="block font-semibold text-[#171817] mb-1">Department</label>
                <select
                  value={formData.department}
                  onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-[#E5E5E0] text-[#171817] focus:outline-none focus:border-[#B69A63]"
                >
                  <option value="Sales">Sales</option>
                  <option value="Human Resources">Human Resources</option>
                  <option value="Operations">Operations</option>
                  <option value="Management">Management</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-[#171817] mb-1">Designation</label>
                <input
                  type="text"
                  value={formData.designation}
                  onChange={(e) => setFormData({ ...formData, designation: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-[#E5E5E0] text-[#171817] focus:outline-none focus:border-[#B69A63]"
                  placeholder="e.g. Senior Closer"
                />
              </div>
              <div>
                <label className="block font-semibold text-[#171817] mb-1">Phone Number</label>
                <input
                  type="text"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-[#E5E5E0] text-[#171817] focus:outline-none focus:border-[#B69A63]"
                  placeholder="+91 98765 43210"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-[#171817] mb-1">Base Salary (₹/mo)</label>
                <input
                  type="number"
                  value={formData.baseSalary}
                  onChange={(e) => setFormData({ ...formData, baseSalary: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-[#E5E5E0] text-[#171817] focus:outline-none focus:border-[#B69A63]"
                  placeholder="35000"
                />
              </div>
              <div>
                <label className="block font-semibold text-[#171817] mb-1">Emergency Contact</label>
                <input
                  type="text"
                  value={formData.emergencyContact}
                  onChange={(e) => setFormData({ ...formData, emergencyContact: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-[#E5E5E0] text-[#171817] focus:outline-none focus:border-[#B69A63]"
                  placeholder="Relative Name / Contact"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-[#F4F4F1] flex items-center justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setIsAddModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary">Create Employee</Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Edit Employee Modal */}
      {editingEmployee && (
        <Modal
          isOpen={true}
          onClose={() => setEditingEmployee(null)}
          title={`Edit Employee: ${editingEmployee.name}`}
          subtitle="Update designation, compensation, contact, and department."
        >
          <form onSubmit={handleSaveEditEmployee} className="space-y-3.5 text-xs">
            {editError && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 font-medium">
                {editError}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-[#171817] mb-1">Full Name *</label>
                <input
                  type="text"
                  required
                  value={editFormData.name}
                  onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-[#E5E5E0] text-[#171817] focus:outline-none focus:border-[#B69A63]"
                />
              </div>
              <div>
                <label className="block font-semibold text-[#171817] mb-1">Phone Number</label>
                <input
                  type="text"
                  value={editFormData.phone}
                  onChange={(e) => setEditFormData({ ...editFormData, phone: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-[#E5E5E0] text-[#171817] focus:outline-none focus:border-[#B69A63]"
                  placeholder="+91 98765 43210"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-[#171817] mb-1">Designation</label>
                <input
                  type="text"
                  value={editFormData.designation}
                  onChange={(e) => setEditFormData({ ...editFormData, designation: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-[#E5E5E0] text-[#171817] focus:outline-none focus:border-[#B69A63]"
                  placeholder="e.g. Senior Closer"
                />
              </div>
              <div>
                <label className="block font-semibold text-[#171817] mb-1">Department</label>
                <select
                  value={editFormData.department}
                  onChange={(e) => setEditFormData({ ...editFormData, department: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-[#E5E5E0] text-[#171817] focus:outline-none focus:border-[#B69A63]"
                >
                  <option value="Sales">Sales</option>
                  <option value="Human Resources">Human Resources</option>
                  <option value="Operations">Operations</option>
                  <option value="Management">Management</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-[#171817] mb-1">Monthly Base Salary (₹)</label>
                <input
                  type="number"
                  value={editFormData.baseSalary}
                  onChange={(e) => setEditFormData({ ...editFormData, baseSalary: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-[#E5E5E0] text-[#171817] focus:outline-none focus:border-[#B69A63]"
                />
              </div>
              <div>
                <label className="block font-semibold text-[#171817] mb-1">Emergency Contact</label>
                <input
                  type="text"
                  value={editFormData.emergencyContact}
                  onChange={(e) => setEditFormData({ ...editFormData, emergencyContact: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-[#E5E5E0] text-[#171817] focus:outline-none focus:border-[#B69A63]"
                  placeholder="Relative / Phone"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-[#F4F4F1] flex items-center justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setEditingEmployee(null)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" isLoading={savingEdit}>
                Save Changes
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
