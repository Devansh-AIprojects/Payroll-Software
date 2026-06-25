import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import ErrorBoundary from './components/ErrorBoundary';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';

// Pages
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Employees from './pages/employees/Employees';
import EmployeeDetail from './pages/employees/EmployeeDetail';
import Exceptions from './pages/attendance/Exceptions';
import AttendanceProcess from './pages/attendance/AttendanceProcess';
import LeaveManagement from './pages/attendance/LeaveManagement';
import ManualAttendance from './pages/attendance/ManualAttendance';
import Periods from './pages/payroll/Periods';
import PeriodDetail from './pages/payroll/PeriodDetail';
import Payslip from './pages/payroll/Payslip';
import SalarySheet from './pages/payroll/SalarySheet';
import ConfigPage from './pages/config/ConfigPage';

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <ToastProvider>
            <Routes>
              {/* Public */}
              <Route path="/login" element={<Login />} />

              {/* Protected — all wrapped in the Layout shell */}
              <Route
                element={
                  <ProtectedRoute>
                    <Layout />
                  </ProtectedRoute>
                }
              >
                {/* Dashboard */}
                <Route path="/" element={<Dashboard />} />

                {/* Employees */}
                <Route path="/employees" element={<Employees />} />
                <Route path="/employees/:employeeId" element={<EmployeeDetail />} />

                {/* Attendance */}
                <Route path="/attendance/process" element={<AttendanceProcess />} />
                <Route path="/attendance/exceptions" element={<Exceptions />} />
                <Route path="/attendance/leave" element={<LeaveManagement />} />
                <Route path="/attendance/manual" element={<ManualAttendance />} />

                {/* Payroll */}
                <Route path="/payroll/periods" element={<Periods />} />
                <Route path="/payroll/periods/:periodId" element={<PeriodDetail />} />
                <Route path="/payroll/periods/:periodId/sheet" element={<SalarySheet />} />
                <Route path="/payroll/periods/:periodId/records/:employeeId" element={<Payslip />} />

                {/* Config */}
                <Route path="/config" element={<ConfigPage />} />
              </Route>

              {/* Catch-all */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </ToastProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
