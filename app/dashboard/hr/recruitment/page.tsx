'use client';

import React, { useState, useEffect } from 'react';
import {
  UserPlus,
  Briefcase,
  Search,
  Plus,
  Star,
  CheckCircle2,
  XCircle,
  Phone,
  Mail,
  Building,
  UserCheck,
  ChevronRight,
  Filter,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { emitCrmSync, useCrmSync } from '@/lib/sync-event';

interface JobOpeningItem {
  id: string;
  title: string;
  department: string;
  location: string;
  openingsCount: number;
  experience: string;
  status: string;
  description?: string | null;
  _count?: { candidates: number };
}

interface CandidateItem {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  currentCompany?: string | null;
  experienceYears?: number | null;
  currentCtc?: number | null;
  expectedCtc?: number | null;
  noticePeriodDays?: number | null;
  stage: string;
  rating?: number | null;
  notes?: string | null;
  jobOpening?: {
    id: string;
    title: string;
    department: string;
  } | null;
}

const STAGES = [
  { key: 'APPLIED', label: 'Applied' },
  { key: 'SCREENING', label: 'Screening' },
  { key: 'INTERVIEW_1', label: 'Interview 1' },
  { key: 'MOCK_PITCH', label: 'Mock Calling Pitch' },
  { key: 'OFFER', label: 'Offer Extended' },
  { key: 'HIRED', label: 'Hired' },
  { key: 'REJECTED', label: 'Rejected' },
];

export default function RecruitmentPipelinePage() {
  const [openings, setOpenings] = useState<JobOpeningItem[]>([]);
  const [candidates, setCandidates] = useState<CandidateItem[]>([]);
  const [selectedStage, setSelectedStage] = useState('');
  const [selectedOpening, setSelectedOpening] = useState('');
  const [loading, setLoading] = useState(true);

  // Modals
  const [isCandidateModalOpen, setIsCandidateModalOpen] = useState(false);
  const [isOpeningModalOpen, setIsOpeningModalOpen] = useState(false);
  const [candidateToHire, setCandidateToHire] = useState<CandidateItem | null>(null);

  // Feedback states
  const [candidateError, setCandidateError] = useState('');
  const [openingError, setOpeningError] = useState('');
  const [hireError, setHireError] = useState('');
  const [hireSuccess, setHireSuccess] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form states
  const [candidateForm, setCandidateForm] = useState({
    fullName: '',
    email: '',
    phone: '',
    jobOpeningId: '',
    currentCompany: '',
    experienceYears: '2',
    currentCtc: '400000',
    expectedCtc: '600000',
    noticePeriodDays: '15',
    notes: '',
  });

  const [openingForm, setOpeningForm] = useState({
    title: '',
    department: 'Sales',
    location: 'Ahmedabad',
    openingsCount: '2',
    experience: '2-4 years',
    description: '',
  });

  const [hireForm, setHireForm] = useState({
    role: 'EXECUTIVE',
    designation: 'Sales Closer',
    department: 'Sales',
    baseSalary: '40000',
  });

  const fetchRecruitment = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedStage) params.set('stage', selectedStage);
      if (selectedOpening) params.set('openingId', selectedOpening);

      const res = await fetch(`/api/hr/recruitment?${params.toString()}`);
      if (res.ok) {
        const json = await res.json();
        setCandidates(json.candidates || []);
        setOpenings(json.openings || []);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecruitment();
  }, [selectedStage, selectedOpening]);

  useCrmSync(['all'], () => {
    fetchRecruitment();
  });

  const handleStageChange = async (candidateId: string, stage: string) => {
    try {
      const res = await fetch(`/api/hr/recruitment/${candidateId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to update candidate stage');
      emitCrmSync('all');
      fetchRecruitment();
    } catch (error) {
      setCandidateError(error instanceof Error ? error.message : 'Failed to update candidate stage');
    }
  };

  const handleCreateOpening = async (e: React.FormEvent) => {
    e.preventDefault();
    setOpeningError('');
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/hr/recruitment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'CREATE_OPENING',
          ...openingForm,
          openingsCount: parseInt(openingForm.openingsCount, 10) || 1,
        }),
      });

      if (res.ok) {
        emitCrmSync('all');
        setIsOpeningModalOpen(false);
        setOpeningForm({
          title: '',
          department: 'Sales',
          location: 'Ahmedabad',
          openingsCount: '2',
          experience: '2-4 years',
          description: '',
        });
        fetchRecruitment();
      } else {
        const err = await res.json();
        setOpeningError(err.error || 'Failed to create job opening');
      }
    } catch {
      setOpeningError('Network error while creating job opening');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateCandidate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCandidateError('');
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/hr/recruitment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'CREATE_CANDIDATE',
          ...candidateForm,
          experienceYears: parseFloat(candidateForm.experienceYears) || 0,
          currentCtc: parseFloat(candidateForm.currentCtc) || 0,
          expectedCtc: parseFloat(candidateForm.expectedCtc) || 0,
          noticePeriodDays: parseInt(candidateForm.noticePeriodDays, 10) || 0,
        }),
      });

      if (res.ok) {
        emitCrmSync('all');
        setIsCandidateModalOpen(false);
        setCandidateForm({
          fullName: '',
          email: '',
          phone: '',
          jobOpeningId: '',
          currentCompany: '',
          experienceYears: '2',
          currentCtc: '400000',
          expectedCtc: '600000',
          noticePeriodDays: '15',
          notes: '',
        });
        fetchRecruitment();
      } else {
        const err = await res.json();
        setCandidateError(err.error || 'Failed to add candidate');
      }
    } catch {
      setCandidateError('Network error while adding candidate');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleHireToEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!candidateToHire) return;
    setHireError('');
    setHireSuccess('');
    setIsSubmitting(true);

    try {
      const res = await fetch('/api/hr/recruitment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'CONVERT_TO_EMPLOYEE',
          candidateId: candidateToHire.id,
          role: hireForm.role,
          designation: hireForm.designation,
          department: hireForm.department,
          baseSalary: parseFloat(hireForm.baseSalary) || 35000,
        }),
      });

      if (res.ok) {
        emitCrmSync('all');
        setHireSuccess(`Candidate ${candidateToHire.fullName} has been successfully hired and added to the Staff Directory!`);
        setTimeout(() => {
          setCandidateToHire(null);
          setHireSuccess('');
          fetchRecruitment();
        }, 1500);
      } else {
        const err = await res.json();
        setHireError(err.error || 'Failed to hire candidate');
      }
    } catch {
      setHireError('Network error while processing hire');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#E5E5E0]">
        <div>
          <h2 className="text-xl font-bold text-[#171817] flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-[#B69A63]" /> Sales Recruitment &amp; Hiring Pipeline
          </h2>
          <p className="text-xs text-[#626560] mt-1">
            Attract, screen, mock-pitch evaluate, and onboard high-performing sales executives into ORVION.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => setIsOpeningModalOpen(true)} className="flex items-center gap-1.5">
            <Briefcase className="w-4 h-4 text-[#B69A63]" /> Post Job Opening
          </Button>
          <Button variant="primary" onClick={() => setIsCandidateModalOpen(true)} className="flex items-center gap-1.5">
            <Plus className="w-4 h-4" /> Add Candidate
          </Button>
        </div>
      </div>

      {/* Open Positions Row */}
      <div>
        <h3 className="text-xs font-bold text-[#8C908A] uppercase tracking-wider mb-2">Active Job Openings</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {openings.map((job) => (
            <div
              key={job.id}
              onClick={() => setSelectedOpening(selectedOpening === job.id ? '' : job.id)}
              className={`p-4 rounded-2xl border transition cursor-pointer bg-white shadow-xs ${
                selectedOpening === job.id
                  ? 'border-[#B69A63] ring-1 ring-[#B69A63]/30 bg-[#FAF8F5]'
                  : 'border-[#E5E5E0] hover:border-[#B69A63]'
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="text-sm font-bold text-[#171817]">{job.title}</h4>
                  <div className="text-[11px] text-[#8C908A] mt-0.5">{job.department} • {job.location}</div>
                </div>
                <span className="px-2.5 py-0.5 rounded-md text-[10px] font-bold bg-[#F4F4F1] text-[#171817] border border-[#E5E5E0]">
                  {job.openingsCount} Openings
                </span>
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-[#626560] border-t border-[#F4F4F1] pt-2">
                <span>Exp: {job.experience}</span>
                <span className="font-semibold text-[#B69A63] tabular-nums">{job._count?.candidates || 0} Candidates</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Stage Tabs Filter */}
      <div className="border-b border-[#E5E5E0] pb-2 flex items-center justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setSelectedStage('')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
              selectedStage === ''
                ? 'bg-[#111314] text-[#F4F2EC] shadow-xs'
                : 'text-[#626560] hover:text-[#171817] hover:bg-[#F4F4F1]'
            }`}
          >
            All Stages ({candidates.length})
          </button>
          {STAGES.map((s) => (
            <button
              key={s.key}
              onClick={() => setSelectedStage(s.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                selectedStage === s.key
                  ? 'bg-[#FAF8F5] text-[#B69A63] border border-[#B69A63]/30 shadow-xs'
                  : 'text-[#626560] hover:text-[#B69A63] hover:bg-[#FAF8F5]'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Candidates List */}
      <div className="space-y-3">
        {loading ? (
          <div className="py-12 text-center text-xs text-[#8C908A]">Loading candidate pipeline...</div>
        ) : candidates.length === 0 ? (
          <div className="py-12 text-center text-xs text-[#8C908A]">No candidates in this stage.</div>
        ) : (
          candidates.map((c) => (
            <div
              key={c.id}
              className="rounded-2xl border border-[#E5E5E0] p-4 bg-white shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4 hover:border-[#B69A63] transition"
            >
              {/* Candidate Info */}
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-[#171817]">{c.fullName}</span>
                  {c.jobOpening && (
                    <span className="text-xs text-[#B69A63] font-semibold bg-[#FAF8F5] px-2 py-0.5 rounded-md border border-[#B69A63]/20">
                      {c.jobOpening.title}
                    </span>
                  )}
                  <span className="px-2.5 py-0.5 rounded-md text-[10px] font-bold bg-[#F4F4F1] text-[#171817] border border-[#E5E5E0]">
                    {c.stage.replace('_', ' ')}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-3 text-xs text-[#626560]">
                  <span className="flex items-center gap-1">
                    <Mail className="w-3.5 h-3.5 text-[#8C908A]" /> {c.email}
                  </span>
                  <span className="flex items-center gap-1">
                    <Phone className="w-3.5 h-3.5 text-[#8C908A]" /> {c.phone}
                  </span>
                  {c.currentCompany && <span>Current: {c.currentCompany}</span>}
                  <span>Exp: {c.experienceYears || 0} yrs</span>
                </div>

                {/* Compensation Expectation */}
                <div className="flex items-center gap-3 text-[11px] text-[#626560] mt-1">
                  <span>Current CTC: ₹{(c.currentCtc || 0).toLocaleString('en-IN')}</span>
                  <span>•</span>
                  <span className="font-semibold text-[#171817]">Expected CTC: ₹{(c.expectedCtc || 0).toLocaleString('en-IN')}</span>
                  <span>•</span>
                  <span>Notice: {c.noticePeriodDays || 0} days</span>
                </div>

                {c.notes && (
                  <div className="text-xs text-[#626560] bg-[#F8F8F6] border border-[#E5E5E0] rounded-lg p-2.5 mt-1.5">
                    <span className="font-semibold text-[#171817]">Evaluator Notes: </span>{c.notes}
                  </div>
                )}
              </div>

              {/* Action Column */}
              <div className="flex items-center gap-2 flex-shrink-0">
                {/* Stage Progression Selector */}
                <select
                  value={c.stage}
                  onChange={(e) => handleStageChange(c.id, e.target.value)}
                  className="px-2.5 py-1.5 text-xs rounded-lg border border-[#E5E5E0] text-[#171817] bg-white focus:outline-none focus:border-[#B69A63]"
                >
                  {STAGES.map((st) => (
                    <option key={st.key} value={st.key}>
                      Move to: {st.label}
                    </option>
                  ))}
                </select>

                {/* Convert to Employee Button */}
                {c.stage !== 'HIRED' && c.stage !== 'REJECTED' && (
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => {
                      setCandidateToHire(c);
                      setHireForm({
                        role: 'EXECUTIVE',
                        designation: c.jobOpening?.title || 'Sales Closer',
                        department: c.jobOpening?.department || 'Sales',
                        baseSalary: (c.expectedCtc ? Math.round(c.expectedCtc / 12) : 40000).toString(),
                      });
                    }}
                    className="flex items-center gap-1"
                  >
                    <UserCheck className="w-3.5 h-3.5" /> 1-Click Hire
                  </Button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* 1-Click Hire Modal */}
      {candidateToHire && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-[#E5E5E0]">
            <h3 className="text-base font-bold text-[#171817] mb-1">Convert Candidate to Official Employee</h3>
            <p className="text-xs text-[#626560] mb-4">
              Provision corporate account for <strong className="text-[#171817]">{candidateToHire.fullName}</strong>.
            </p>

            {hireError && (
              <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-semibold text-red-700 flex items-center gap-2">
                <XCircle className="w-4 h-4 flex-shrink-0" /> {hireError}
              </div>
            )}

            {hireSuccess && (
              <div className="mb-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-700 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> {hireSuccess}
              </div>
            )}

            <form onSubmit={handleHireToEmployee} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-[#171817] mb-1">System Role*</label>
                <select
                  value={hireForm.role}
                  onChange={(e) => setHireForm({ ...hireForm, role: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-[#E5E5E0] text-[#171817] focus:outline-none focus:border-[#B69A63]"
                >
                  <option value="EXECUTIVE">Executive (Sales)</option>
                  <option value="TEAM_LEAD">Team Lead</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#171817] mb-1">Official Designation*</label>
                <input
                  type="text"
                  required
                  value={hireForm.designation}
                  onChange={(e) => setHireForm({ ...hireForm, designation: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-[#E5E5E0] text-[#171817] focus:outline-none focus:border-[#B69A63]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#171817] mb-1">Monthly Base Salary (₹)*</label>
                <input
                  type="number"
                  required
                  value={hireForm.baseSalary}
                  onChange={(e) => setHireForm({ ...hireForm, baseSalary: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-[#E5E5E0] text-[#171817] focus:outline-none focus:border-[#B69A63]"
                />
              </div>

              <div className="pt-3 border-t border-[#F4F4F1] flex items-center justify-end gap-2">
                <Button type="button" variant="secondary" onClick={() => setCandidateToHire(null)} disabled={isSubmitting}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" disabled={isSubmitting}>
                  {isSubmitting ? 'Creating Employee...' : 'Confirm Hire & Create Account'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Candidate Modal */}
      {isCandidateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-[#E5E5E0]">
            <h3 className="text-base font-bold text-[#171817] mb-1">Add New Job Applicant</h3>
            <p className="text-xs text-[#626560] mb-4">
              Enter candidate details to track through the hiring pipeline.
            </p>

            {candidateError && (
              <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-semibold text-red-700 flex items-center gap-2">
                <XCircle className="w-4 h-4 flex-shrink-0" /> {candidateError}
              </div>
            )}

            <form onSubmit={handleCreateCandidate} className="space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#171817] mb-1">Full Name*</label>
                  <input
                    type="text"
                    required
                    value={candidateForm.fullName}
                    onChange={(e) => setCandidateForm({ ...candidateForm, fullName: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-[#E5E5E0] text-[#171817] focus:outline-none focus:border-[#B69A63]"
                    placeholder="e.g. Meera Joshi"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#171817] mb-1">Email*</label>
                  <input
                    type="email"
                    required
                    value={candidateForm.email}
                    onChange={(e) => setCandidateForm({ ...candidateForm, email: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-[#E5E5E0] text-[#171817] focus:outline-none focus:border-[#B69A63]"
                    placeholder="meera@example.com"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#171817] mb-1">Phone*</label>
                  <input
                    type="text"
                    required
                    value={candidateForm.phone}
                    onChange={(e) => setCandidateForm({ ...candidateForm, phone: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-[#E5E5E0] text-[#171817] focus:outline-none focus:border-[#B69A63]"
                    placeholder="+91 98980 99887"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#171817] mb-1">Job Opening</label>
                  <select
                    value={candidateForm.jobOpeningId}
                    onChange={(e) => setCandidateForm({ ...candidateForm, jobOpeningId: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-[#E5E5E0] text-[#171817] focus:outline-none focus:border-[#B69A63]"
                  >
                    <option value="">General Applicant</option>
                    {openings.map((op) => (
                      <option key={op.id} value={op.id}>
                        {op.title}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#171817] mb-1">Experience (Yrs)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={candidateForm.experienceYears}
                    onChange={(e) => setCandidateForm({ ...candidateForm, experienceYears: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-[#E5E5E0] text-[#171817] focus:outline-none focus:border-[#B69A63]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#171817] mb-1">Current CTC (₹)</label>
                  <input
                    type="number"
                    value={candidateForm.currentCtc}
                    onChange={(e) => setCandidateForm({ ...candidateForm, currentCtc: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-[#E5E5E0] text-[#171817] focus:outline-none focus:border-[#B69A63]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#171817] mb-1">Expected CTC (₹)</label>
                  <input
                    type="number"
                    value={candidateForm.expectedCtc}
                    onChange={(e) => setCandidateForm({ ...candidateForm, expectedCtc: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-[#E5E5E0] text-[#171817] focus:outline-none focus:border-[#B69A63]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#171817] mb-1">Interview / Screening Notes</label>
                <textarea
                  rows={2}
                  value={candidateForm.notes}
                  onChange={(e) => setCandidateForm({ ...candidateForm, notes: e.target.value })}
                  placeholder="Strong telephone communication, experience in luxury commercial sales..."
                  className="w-full px-3 py-2 text-xs rounded-lg border border-[#E5E5E0] text-[#171817] focus:outline-none focus:border-[#B69A63] resize-none"
                />
              </div>

              <div className="pt-3 border-t border-[#F4F4F1] flex items-center justify-end gap-2">
                <Button type="button" variant="secondary" onClick={() => setIsCandidateModalOpen(false)} disabled={isSubmitting}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" disabled={isSubmitting}>
                  {isSubmitting ? 'Adding...' : 'Add to Pipeline'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Post Job Opening Modal */}
      {isOpeningModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-[#E5E5E0]">
            <h3 className="text-base font-bold text-[#171817] mb-1">Post New Job Opening</h3>
            <p className="text-xs text-[#626560] mb-4">
              Publish a requisition for sales or operations talent.
            </p>

            {openingError && (
              <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-semibold text-red-700 flex items-center gap-2">
                <XCircle className="w-4 h-4 flex-shrink-0" /> {openingError}
              </div>
            )}

            <form onSubmit={handleCreateOpening} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-[#171817] mb-1">Job Title*</label>
                <input
                  type="text"
                  required
                  value={openingForm.title}
                  onChange={(e) => setOpeningForm({ ...openingForm, title: e.target.value })}
                  placeholder="e.g. Enterprise Sales Closer"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-[#E5E5E0] text-[#171817] focus:outline-none focus:border-[#B69A63]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#171817] mb-1">Department</label>
                  <select
                    value={openingForm.department}
                    onChange={(e) => setOpeningForm({ ...openingForm, department: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-[#E5E5E0] text-[#171817] focus:outline-none focus:border-[#B69A63]"
                  >
                    <option value="Sales">Sales</option>
                    <option value="Operations">Operations</option>
                    <option value="Human Resources">Human Resources</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#171817] mb-1">Openings Count</label>
                  <input
                    type="number"
                    value={openingForm.openingsCount}
                    onChange={(e) => setOpeningForm({ ...openingForm, openingsCount: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-[#E5E5E0] text-[#171817] focus:outline-none focus:border-[#B69A63]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#171817] mb-1">Experience Required*</label>
                <input
                  type="text"
                  required
                  value={openingForm.experience}
                  onChange={(e) => setOpeningForm({ ...openingForm, experience: e.target.value })}
                  placeholder="e.g. 2-4 years in Real Estate / High Ticket Sales"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-[#E5E5E0] text-[#171817] focus:outline-none focus:border-[#B69A63]"
                />
              </div>

              <div className="pt-3 border-t border-[#F4F4F1] flex items-center justify-end gap-2">
                <Button type="button" variant="secondary" onClick={() => setIsOpeningModalOpen(false)} disabled={isSubmitting}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" disabled={isSubmitting}>
                  {isSubmitting ? 'Publishing...' : 'Publish Job Requisition'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
