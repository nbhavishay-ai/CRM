'use client';

import React, { useState } from 'react';
import {
  X,
  Download,
  Calendar,
  FileSpreadsheet,
  Layers,
  CheckCircle2,
  Clock,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface AttendanceExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentSelectedDate?: string;
}

export const AttendanceExportModal: React.FC<AttendanceExportModalProps> = ({
  isOpen,
  onClose,
  currentSelectedDate,
}) => {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  const getMonthStart = (y: number, m: number) => {
    return `${y}-${String(m + 1).padStart(2, '0')}-01`;
  };

  const getMonthEnd = (y: number, m: number) => {
    const lastDay = new Date(y, m + 1, 0).getDate();
    return `${y}-${String(m + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  };

  const [preset, setPreset] = useState<'CURRENT_MONTH' | 'PREV_MONTH' | 'SELECTED_DATE' | 'CUSTOM'>('CURRENT_MONTH');
  const [startDate, setStartDate] = useState(getMonthStart(currentYear, currentMonth));
  const [endDate, setEndDate] = useState(now.toISOString().split('T')[0]);
  const [exportType, setExportType] = useState<'daily' | 'summary'>('daily');
  const [isExporting, setIsExporting] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);

  if (!isOpen) return null;

  const applyPreset = (type: 'CURRENT_MONTH' | 'PREV_MONTH' | 'SELECTED_DATE' | 'CUSTOM') => {
    setPreset(type);
    setDownloadSuccess(false);

    if (type === 'CURRENT_MONTH') {
      setStartDate(getMonthStart(currentYear, currentMonth));
      setEndDate(now.toISOString().split('T')[0]);
    } else if (type === 'PREV_MONTH') {
      const prevYear = currentMonth === 0 ? currentYear - 1 : currentYear;
      const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
      setStartDate(getMonthStart(prevYear, prevMonth));
      setEndDate(getMonthEnd(prevYear, prevMonth));
    } else if (type === 'SELECTED_DATE') {
      const target = currentSelectedDate || now.toISOString().split('T')[0];
      setStartDate(target);
      setEndDate(target);
    }
  };

  const handleDownload = () => {
    setIsExporting(true);
    setDownloadSuccess(false);

    try {
      const url = `/api/hr/attendance/export?startDate=${startDate}&endDate=${endDate}&format=csv&type=${exportType}&_t=${Date.now()}`;
      
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute(
        'download',
        `attendance_${exportType}_${startDate}_to_${endDate}.csv`
      );
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setDownloadSuccess(true);
      setTimeout(() => {
        setDownloadSuccess(false);
      }, 4000);
    } catch (err) {
      console.error('Export download error:', err);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="w-full max-w-lg bg-white rounded-3xl border border-[#E5E5E0] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-[#E5E5E0] bg-[#FAF9F5] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#111314] text-[#F4F2EC] flex items-center justify-center shadow-xs border border-[#252829]">
              <FileSpreadsheet className="w-5 h-5 text-[#B69A63]" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[#171817]">Export Attendance Register</h3>
              <p className="text-xs text-[#626560]">Download 1-Month, Date Range, or Daily Attendance Sheets</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-[#8C908A] hover:text-[#171817] hover:bg-[#F4F4F1] transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 overflow-y-auto">
          {/* Quick Presets */}
          <div>
            <label className="block text-xs font-bold text-[#171817] mb-2 uppercase tracking-wider">
              1. Select Time Horizon
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <button
                type="button"
                onClick={() => applyPreset('CURRENT_MONTH')}
                className={`px-3 py-2 rounded-xl text-xs font-bold border transition text-center cursor-pointer ${
                  preset === 'CURRENT_MONTH'
                    ? 'bg-[#111314] text-[#F4F2EC] border-[#111314] shadow-xs'
                    : 'bg-[#F8F8F6] text-[#626560] border-[#E5E5E0] hover:bg-[#FAF9F5] hover:text-[#171817]'
                }`}
              >
                Current Month
              </button>

              <button
                type="button"
                onClick={() => applyPreset('PREV_MONTH')}
                className={`px-3 py-2 rounded-xl text-xs font-bold border transition text-center cursor-pointer ${
                  preset === 'PREV_MONTH'
                    ? 'bg-[#111314] text-[#F4F2EC] border-[#111314] shadow-xs'
                    : 'bg-[#F8F8F6] text-[#626560] border-[#E5E5E0] hover:bg-[#FAF9F5] hover:text-[#171817]'
                }`}
              >
                Previous Month
              </button>

              <button
                type="button"
                onClick={() => applyPreset('SELECTED_DATE')}
                className={`px-3 py-2 rounded-xl text-xs font-bold border transition text-center cursor-pointer ${
                  preset === 'SELECTED_DATE'
                    ? 'bg-[#111314] text-[#F4F2EC] border-[#111314] shadow-xs'
                    : 'bg-[#F8F8F6] text-[#626560] border-[#E5E5E0] hover:bg-[#FAF9F5] hover:text-[#171817]'
                }`}
              >
                Selected Day
              </button>

              <button
                type="button"
                onClick={() => setPreset('CUSTOM')}
                className={`px-3 py-2 rounded-xl text-xs font-bold border transition text-center cursor-pointer ${
                  preset === 'CUSTOM'
                    ? 'bg-[#111314] text-[#F4F2EC] border-[#111314] shadow-xs'
                    : 'bg-[#F8F8F6] text-[#626560] border-[#E5E5E0] hover:bg-[#FAF9F5] hover:text-[#171817]'
                }`}
              >
                Custom Range
              </button>
            </div>
          </div>

          {/* Date Picker Range Inputs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 rounded-2xl bg-[#F8F8F6] border border-[#E5E5E0]">
            <div>
              <label className="block text-[11px] font-bold text-[#626560] uppercase mb-1">
                Start Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setPreset('CUSTOM');
                }}
                className="w-full px-3 py-2 text-xs rounded-xl bg-white border border-[#E5E5E0] text-[#171817] focus:outline-none focus:border-[#B69A63]"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-[#626560] uppercase mb-1">
                End Date
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setPreset('CUSTOM');
                }}
                className="w-full px-3 py-2 text-xs rounded-xl bg-white border border-[#E5E5E0] text-[#171817] focus:outline-none focus:border-[#B69A63]"
              />
            </div>
          </div>

          {/* Report Layout Structure */}
          <div>
            <label className="block text-xs font-bold text-[#171817] mb-2 uppercase tracking-wider">
              2. Choose Report Format
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div
                onClick={() => setExportType('daily')}
                className={`p-4 rounded-2xl border-2 transition cursor-pointer space-y-1 ${
                  exportType === 'daily'
                    ? 'border-[#B69A63] bg-[#FAF8F3]'
                    : 'border-[#E5E5E0] bg-white hover:bg-[#FAF9F5]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#171817] flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-[#B69A63]" /> Detailed Daily Logs
                  </span>
                  <input
                    type="radio"
                    name="exportType"
                    checked={exportType === 'daily'}
                    onChange={() => setExportType('daily')}
                    className="accent-[#111314]"
                  />
                </div>
                <p className="text-[11px] text-[#626560] leading-relaxed">
                  Row-by-row daily logs with Mark-in, Mark-out times, work hours, shift statuses, and notes for every day.
                </p>
              </div>

              <div
                onClick={() => setExportType('summary')}
                className={`p-4 rounded-2xl border-2 transition cursor-pointer space-y-1 ${
                  exportType === 'summary'
                    ? 'border-[#B69A63] bg-[#FAF8F3]'
                    : 'border-[#E5E5E0] bg-white hover:bg-[#FAF9F5]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#171817] flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-[#B69A63]" /> Monthly Summary Roll-Up
                  </span>
                  <input
                    type="radio"
                    name="exportType"
                    checked={exportType === 'summary'}
                    onChange={() => setExportType('summary')}
                    className="accent-[#111314]"
                  />
                </div>
                <p className="text-[11px] text-[#626560] leading-relaxed">
                  Aggregated table showing total Present, Half Days, Leaves, Absences, total logged hours, and Attendance %.
                </p>
              </div>
            </div>
          </div>

          {/* Success Banner */}
          {downloadSuccess && (
            <div className="p-3.5 rounded-xl bg-[#F0F7F2] border border-[#2D5A3C]/20 text-[#2D5A3C] text-xs flex items-center gap-2 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span className="font-semibold">
                Attendance CSV successfully generated and downloaded! (UTF-8 Excel compatible)
              </span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[#E5E5E0] bg-[#FAF9F5] flex items-center justify-between gap-3">
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>

          <Button
            variant="primary"
            size="sm"
            onClick={handleDownload}
            isLoading={isExporting}
            className="flex items-center gap-2 cursor-pointer font-bold px-5"
          >
            <Download className="w-4 h-4 text-[#B69A63]" />
            Download {exportType === 'daily' ? 'Daily Log' : 'Monthly Summary'} CSV
          </Button>
        </div>
      </div>
    </div>
  );
};
