import { useState, useEffect } from 'react';
import api from '../../api/client';
import DataTable from '../../components/DataTable';
import StatusBadge from '../../components/StatusBadge';
import { Spinner } from '../../components/Loader';

export default function AttendanceProcess() {
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split('T')[0];
  });
  const [toDate, setToDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  // Employee daily view
  const [employees, setEmployees] = useState([]);
  const [selectedEmp, setSelectedEmp] = useState('');
  const [dailyRecords, setDailyRecords] = useState([]);
  const [dailyLoading, setDailyLoading] = useState(false);

  useEffect(() => {
    api.get('/employees?page=1&page_size=200&is_active=true')
      .then((res) => setEmployees(res.data || []))
      .catch(() => {});
  }, []);

  async function handleProcess(e) {
    e.preventDefault();
    setProcessing(true);
    setError('');
    setResult(null);
    try {
      const res = await api.post('/attendance/process', {
        from_date: fromDate,
        to_date: toDate,
      });
      setResult(res.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setProcessing(false);
    }
  }

  async function loadDailyRecords() {
    if (!selectedEmp) return;
    setDailyLoading(true);
    try {
      const res = await api.get(
        `/attendance/daily/${selectedEmp}?from_date=${fromDate}&to_date=${toDate}`
      );
      setDailyRecords(res.data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setDailyLoading(false);
    }
  }

  useEffect(() => {
    if (selectedEmp) loadDailyRecords();
  }, [selectedEmp]);

  const dailyColumns = [
    {
      key: 'date',
      label: 'Date',
      render: (val) => new Date(val).toLocaleDateString('en-IN', {
        weekday: 'short', day: '2-digit', month: 'short',
      }),
    },
    {
      key: 'status',
      label: 'Status',
      render: (val) => <StatusBadge status={val} />,
    },
    {
      key: 'first_punch',
      label: 'In',
      render: (val) => val ? val.substring(0, 5) : '—',
    },
    {
      key: 'last_punch',
      label: 'Out',
      render: (val) => val ? val.substring(0, 5) : '—',
    },
    {
      key: 'ot_hours',
      label: 'OT',
      align: 'right',
      render: (val) => val > 0 ? <span className="text-success">{val}h</span> : '—',
    },
    {
      key: 'undertime_hours',
      label: 'UT',
      align: 'right',
      render: (val) => val > 0 ? <span className="text-error">{val}h</span> : '—',
    },
    {
      key: 'is_exception',
      label: 'Flag',
      render: (val) => val
        ? <span className="badge badge-processing">Flagged</span>
        : <span className="badge badge-paid">OK</span>,
    },
    {
      key: 'is_manual_override',
      label: 'Override',
      render: (val) => val
        ? <span className="badge badge-warning">Manual</span>
        : '—',
    },
  ];

  return (
    <div className="animate-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Attendance Processing</h1>
          <p className="page-subtitle">Process raw punch logs into daily attendance records</p>
        </div>
      </div>

      {/* Process engine card */}
      <div className="card" style={{ marginBottom: 'var(--space-6)' }}>
        <h2 className="card-title" style={{ marginBottom: 'var(--space-5)' }}>Run Processing Engine</h2>
        <form onSubmit={handleProcess}>
          <div className="flex gap-4 items-end flex-wrap">
            <div className="form-group">
              <label className="form-label">From Date</label>
              <input
                type="date"
                className="form-input"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">To Date</label>
              <input
                type="date"
                className="form-input"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                required
              />
            </div>
            <button type="submit" className="btn btn-primary" disabled={processing}>
              {processing ? 'Processing...' : 'Process Attendance'}
            </button>
          </div>
        </form>

        {error && <div className="alert alert-error" style={{ marginTop: 'var(--space-4)' }}>{error}</div>}

        {result && (
          <div className="alert alert-success" style={{ marginTop: 'var(--space-4)' }}>
            Processing complete:&nbsp;
            <strong>{result.records_processed}</strong> records processed,&nbsp;
            <strong>{result.exceptions_flagged}</strong> exceptions flagged,&nbsp;
            <strong>{result.skipped_manual}</strong> manual overrides skipped.
          </div>
        )}
      </div>

      {/* Daily records viewer */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">View Daily Records</h2>
          <div className="flex gap-3 items-center">
            <select
              className="form-select"
              value={selectedEmp}
              onChange={(e) => setSelectedEmp(e.target.value)}
              style={{ minWidth: 220 }}
            >
              <option value="">Select employee...</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.employee_code} — {emp.name}
                </option>
              ))}
            </select>
            {selectedEmp && (
              <button className="btn btn-secondary btn-sm" onClick={loadDailyRecords}>
                Refresh
              </button>
            )}
          </div>
        </div>

        {!selectedEmp ? (
          <div className="empty-state" style={{ padding: 'var(--space-8)' }}>
            <p className="text-sm">Select an employee to view their daily attendance</p>
          </div>
        ) : dailyLoading ? (
          <Spinner />
        ) : (
          <DataTable
            columns={dailyColumns}
            data={dailyRecords}
            emptyMessage="No attendance records for this date range."
          />
        )}
      </div>
    </div>
  );
}
