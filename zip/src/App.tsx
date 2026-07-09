import { BrowserRouter, Routes, Route, useNavigate, useParams, Link } from 'react-router-dom';
import React, { useEffect, useState } from 'react';
import { Users, BookOpen, Clock, CheckCircle2, XCircle, RefreshCw, Save, Download, Upload, Trash2, Plus, ArrowLeft, ChevronDown } from 'lucide-react';
import { db } from './lib/firebase';
import { collection, query, where, onSnapshot, addDoc, updateDoc, doc, getDocs, deleteDoc } from 'firebase/firestore';
import * as XLSX from 'xlsx';
import amuraLogo from './assets/amura-logo.jpg';
import amuraMascot from './assets/amura-mascot.jpg';
import meetingIdGuide from './assets/huong-dan-meeting-id.png';

// Types
type ZoomEvent = {
  id: string;
  meeting_id: string;
  zoom_user_id: string | null;
  zoom_session_id: string;
  ten: string;
  email: string | null;
  trang_thai: 'joined' | 'left';
  thoi_gian: Date;
};

type Student = {
  zoom_id: string | null;
  ten: string;
  email: string | null;
};

type StudentGroup = {
  id: string;
  ten_nhom: string;
  hoc_sinh: Student[];
  updated_at: Date;
};

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-brand-100 selection:text-brand-900 flex flex-col">
        <header className="h-16 bg-white border-b border-slate-200 sticky top-0 z-10 shadow-sm flex items-center px-8">
          <div className="max-w-7xl mx-auto w-full flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img src={amuraLogo} alt="AMURA" className="h-7 w-auto object-contain" />
              <span className="hidden sm:inline text-sm font-medium text-slate-400 border-l border-slate-200 pl-3">Điểm danh Zoom</span>
            </div>
          </div>
        </header>
        <main className="flex-1 w-full max-w-7xl mx-auto px-8 py-8 flex flex-col gap-8">
          <Routes>
            <Route path="/" element={<SelectAccount />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/class/:meetingId" element={<ClassView />} />
            <Route path="/groups" element={<ManageGroups />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

// Danh sách tài khoản Zoom đã kết nối. Hiện chỉ có 1 tài khoản, nhưng để dạng mảng
// sẵn để sau này thêm tài khoản mới không cần sửa lại UI chọn tài khoản.
const ZOOM_ACCOUNTS = [
  { id: 'zoom3', email: 'zoom3.amura@gmail.com', label: 'Z3' },
];

function SelectAccount() {
  const navigate = useNavigate();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);

  const selectedAccount = ZOOM_ACCOUNTS.find(a => a.id === selectedAccountId) || null;

  return (
    <div className="max-w-md mx-auto mt-12 bg-white rounded-xl shadow-sm border border-slate-200 p-8">
      <div className="text-center mb-8">
        <img src={amuraMascot} alt="AMURA" className="w-20 h-20 object-contain mx-auto mb-4" />
        <h2 className="text-2xl font-semibold text-slate-800">Chọn tài khoản Zoom</h2>
        <p className="text-slate-500 mt-2">Chọn tài khoản đã kết nối để tiếp tục</p>
      </div>

      <div className="relative">
        <button
          type="button"
          onClick={() => setPickerOpen(o => !o)}
          className="w-full flex items-center justify-between p-4 rounded-lg border-2 border-slate-200 hover:border-brand-300 bg-white transition-colors"
        >
          {selectedAccount ? (
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 font-semibold">
                {selectedAccount.label}
              </div>
              <p className="font-medium text-slate-900">{selectedAccount.email}</p>
            </div>
          ) : (
            <span className="text-slate-500 font-medium">Chọn 1 tài khoản</span>
          )}
          <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform ${pickerOpen ? 'rotate-180' : ''}`} />
        </button>

        {pickerOpen && (
          <div className="absolute z-10 mt-2 w-full bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden">
            {ZOOM_ACCOUNTS.map(acc => (
              <button
                key={acc.id}
                type="button"
                onClick={() => { setSelectedAccountId(acc.id); setPickerOpen(false); }}
                className="w-full flex items-center gap-3 p-4 hover:bg-brand-50 transition-colors text-left"
              >
                <div className="w-10 h-10 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 font-semibold">
                  {acc.label}
                </div>
                <p className="font-medium text-slate-900">{acc.email}</p>
              </button>
            ))}
          </div>
        )}
      </div>

      <button
        onClick={() => navigate('/dashboard')}
        disabled={!selectedAccount}
        className="w-full mt-8 bg-brand-600 text-white px-5 py-3 rounded-lg font-medium text-sm hover:bg-brand-700 transition-colors flex justify-center items-center gap-2 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-brand-600"
      >
        Tiếp tục <ArrowLeft className="w-4 h-4 rotate-180" />
      </button>
    </div>
  );
}

function Dashboard() {
  const navigate = useNavigate();
  const [meetingId, setMeetingId] = useState('');
  const [idError, setIdError] = useState(false);

  const handleJoinClass = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // Zoom hiển thị Meeting ID có dấu cách (VD: "862 1715 1201") nhưng webhook gửi
    // về không có dấu cách ("86217151201") -> phải xoá HẾT khoảng trắng, không chỉ 2 đầu.
    const cleanId = meetingId.replace(/\s+/g, '');
    // Meeting ID của Zoom luôn gồm đúng 11 chữ số.
    if (/^\d{11}$/.test(cleanId)) {
      setIdError(false);
      navigate(`/class/${cleanId}`);
    } else {
      setIdError(true);
    }
  };

  return (
    <div className="w-full flex flex-col flex-1">
      <div className="flex items-center gap-3 mb-8">
        <Link to="/" className="text-slate-400 hover:text-slate-600 transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h2 className="text-xl font-semibold text-slate-800">Menu chính</h2>
      </div>

      <div className="grid md:grid-cols-2 gap-6 w-full max-w-4xl">
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col">
          <div className="flex justify-between items-start mb-4">
            <div className="flex flex-col">
              <span className="text-slate-500 text-sm font-medium">Tham gia</span>
              <span className="text-xl font-bold mt-1 text-slate-900">Xem lớp học</span>
            </div>
            <div className="p-2 bg-brand-50 text-brand-600 rounded-lg">
              <BookOpen className="w-6 h-6" />
            </div>
          </div>
          <p className="text-slate-500 mb-6 flex-grow text-sm">Nhập ID cuộc họp Zoom để xem danh sách điểm danh trực tiếp.</p>
          
          <form onSubmit={handleJoinClass} className="flex gap-4">
            <div className="relative flex-grow">
              <input
                type="text"
                placeholder="Meeting ID..."
                className={`w-full bg-slate-100 border focus:bg-white focus:ring-0 rounded-lg py-2 px-4 text-sm transition-all font-mono ${idError ? 'border-red-400 focus:border-red-500' : 'border-transparent focus:border-brand-500'}`}
                value={meetingId}
                onChange={e => { setMeetingId(e.target.value); setIdError(false); }}
                required
              />
            </div>
            <button type="submit" className="bg-brand-600 text-white px-5 py-2 rounded-lg font-medium text-sm hover:bg-brand-700 transition-colors shadow-sm">
              Vào
            </button>
          </form>

          {idError && (
            <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-red-800 font-semibold text-sm mb-1">
                Meeting ID không hợp lệ — phải gồm đúng 11 chữ số (VD: 867 5445 8511).
              </p>
              <p className="text-red-700 text-xs mb-3">Xem đúng Meeting ID trong khung thông tin cuộc họp trên Zoom:</p>
              <img src={meetingIdGuide} alt="Vị trí Meeting ID trên Zoom" className="rounded-lg border border-red-200 max-w-full sm:max-w-xs" />
            </div>
          )}
        </div>

        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col">
          <div className="flex justify-between items-start mb-4">
            <div className="flex flex-col">
              <span className="text-slate-500 text-sm font-medium">Quản lý</span>
              <span className="text-xl font-bold mt-1 text-slate-900">Nhóm học sinh</span>
            </div>
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
              <Users className="w-6 h-6" />
            </div>
          </div>
          <p className="text-slate-500 mb-6 flex-grow text-sm">Tạo, sửa, xoá danh sách lớp cố định để điểm danh nhanh.</p>
          
          <button 
            onClick={() => navigate('/groups')}
            className="w-full bg-slate-100 text-slate-700 px-5 py-2 rounded-lg font-medium text-sm hover:bg-slate-200 transition-colors text-center"
          >
            Quản lý nhóm
          </button>
        </div>
      </div>
    </div>
  );
}

function ClassView() {
  const { meetingId } = useParams();
  const [events, setEvents] = useState<ZoomEvent[]>([]);
  const [groups, setGroups] = useState<StudentGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [attendanceOpen, setAttendanceOpen] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [saveToExistingGroup, setSaveToExistingGroup] = useState('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Tải danh sách nhóm học sinh (dùng cho điểm danh + lưu, và cho nút "Làm mới").
  const loadGroups = async () => {
    const groupSnap = await getDocs(collection(db, 'student_groups'));
    const grps: StudentGroup[] = [];
    groupSnap.forEach(d => {
      grps.push({ id: d.id, ...d.data() } as StudentGroup);
    });
    setGroups(grps);
  };

  useEffect(() => {
    if (!meetingId) return;
    setLoading(true);

    // Chỉ lọc theo meeting_id, KHÔNG dùng orderBy -> không cần tạo composite index Firestore.
    const q = query(
      collection(db, 'attendance_events'),
      where('meeting_id', '==', meetingId)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const cutoff = Date.now() - 12 * 60 * 60 * 1000; // bỏ log cũ hơn 12 giờ (meeting ID có thể bị dùng lại)
        const newEvents: ZoomEvent[] = [];
        snapshot.forEach(docSnap => {
          const data = docSnap.data();
          const thoi_gian = data.thoi_gian?.toDate?.() || new Date();
          if (thoi_gian.getTime() < cutoff) return;
          newEvents.push({
            id: docSnap.id,
            meeting_id: data.meeting_id,
            zoom_user_id: data.zoom_user_id ?? null,
            zoom_session_id: data.zoom_session_id,
            ten: data.ten,
            email: data.email ?? null,
            trang_thai: data.trang_thai,
            thoi_gian,
          });
        });
        // Sort tăng dần theo thời gian: bản ghi mới nhất sẽ ghi đè trong rosterMap bên dưới.
        newEvents.sort((a, b) => a.thoi_gian.getTime() - b.thoi_gian.getTime());
        setEvents(newEvents);
        setLoading(false);
      },
      (err) => {
        console.error('Lỗi đọc attendance_events:', err);
        setLoading(false);
      }
    );

    loadGroups();

    return () => unsubscribe();
  }, [meetingId]);

  const handleRefresh = async () => {
    await loadGroups();
    showToast('Đã làm mới danh sách');
  };

  // Aggregate logic: only latest event per session_id (or user_id if we wanted, but session_id is more stable per meeting)
  const rosterMap = new Map<string, ZoomEvent>();
  
  events.forEach(ev => {
    // Group by zoom_user_id if available, fallback to zoom_session_id
    const key = ev.zoom_user_id || ev.zoom_session_id;
    rosterMap.set(key, ev);
  });

  const danh_sach_toan_bo = Array.from(rosterMap.values());
  const danh_sach_dang_co_mat = danh_sach_toan_bo.filter(e => e.trang_thai === 'joined');
  
  // Normalizing function for matching names if no zoom_id
  const normalizeString = (str: string) => str.toLowerCase().replace(/\s+/g, '').trim();

  const selectedGroup = groups.find(g => g.id === selectedGroupId);

  // Danh sách học sinh trong nhóm mà hiện KHÔNG có mặt (dùng cho popup điểm danh).
  const missingStudents: Student[] = selectedGroup
    ? selectedGroup.hoc_sinh.filter(hs => {
        if (hs.zoom_id && danh_sach_dang_co_mat.some(p => p.zoom_user_id === hs.zoom_id)) return false;
        const n = normalizeString(hs.ten);
        if (danh_sach_dang_co_mat.some(p => normalizeString(p.ten) === n)) return false;
        return true;
      })
    : [];

  // Handle Quick Save
  const handleQuickSave = async () => {
    const hoc_sinh: Student[] = danh_sach_toan_bo.map(e => ({
      zoom_id: e.zoom_user_id,
      ten: e.ten,
      email: e.email
    }));

    if (saveToExistingGroup) {
      // Update existing
      await updateDoc(doc(db, 'student_groups', saveToExistingGroup), {
        hoc_sinh,
        updated_at: new Date()
      });
      showToast('Đã cập nhật danh sách vào nhóm có sẵn!');
    } else if (newGroupName.trim()) {
      // Create new
      await addDoc(collection(db, 'student_groups'), {
        ten_nhom: newGroupName.trim(),
        hoc_sinh,
        created_at: new Date(),
        updated_at: new Date()
      });
      showToast('Đã tạo nhóm mới thành công!');
    }
    setSaveModalOpen(false);
    setNewGroupName('');
    setSaveToExistingGroup('');
  };

  return (
    <div className="w-full flex flex-col flex-1 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center gap-3 text-sm text-slate-500 mb-1">
            <Link to="/dashboard" className="hover:text-slate-900 transition-colors flex items-center gap-1 font-medium">
               <ArrowLeft className="w-4 h-4" /> Quay lại
            </Link>
            <span>&bull;</span>
            <span className="font-mono bg-slate-100 px-2 py-0.5 rounded text-xs text-slate-600">ID: {meetingId}</span>
          </div>
          <h2 className="text-xl font-bold text-slate-800 mt-2">Lớp đang diễn ra</h2>
          <p className="text-sm text-slate-500 mt-1 font-medium">
             Sĩ số hiện tại: <span className="text-emerald-600 font-bold">{danh_sach_dang_co_mat.length}</span> / Từng tham gia: {danh_sach_toan_bo.length}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleRefresh}
            className="px-4 py-2 rounded-lg font-medium text-sm transition-colors flex items-center gap-2 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 shadow-sm"
            title="Làm mới danh sách"
          >
            <RefreshCw className="w-4 h-4" />
            Làm mới
          </button>
          <button
            onClick={() => setAttendanceOpen(true)}
            className="px-5 py-2 rounded-lg font-medium text-sm transition-colors flex items-center gap-2 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 shadow-sm"
          >
            <CheckCircle2 className="w-4 h-4" />
            Điểm danh nhanh
          </button>
          <button
            onClick={() => setSaveModalOpen(true)}
            className="bg-brand-600 text-white px-5 py-2 rounded-lg font-medium text-sm hover:bg-brand-700 transition-colors shadow-sm flex items-center gap-2"
          >
            <Save className="w-4 h-4" />
            Lưu danh sách
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><RefreshCw className="w-8 h-8 animate-spin text-slate-400" /></div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
          {danh_sach_toan_bo.map(student => {
            const isPresent = student.trang_thai === 'joined';
            return (
              <div 
                key={student.zoom_session_id} 
                className={`p-5 rounded-xl border shadow-sm transition-all ${
                  isPresent 
                    ? 'border-emerald-200 bg-white shadow-emerald-100' 
                    : 'border-slate-200 bg-slate-50 opacity-80'
                }`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className={`w-2.5 h-2.5 rounded-full ${isPresent ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-slate-400'}`}></div>
                    <span className={`text-[10px] uppercase tracking-wider font-bold ${isPresent ? 'text-emerald-600' : 'text-slate-500'}`}>
                      {isPresent ? 'Đang học' : 'Đã rời'}
                    </span>
                  </div>
                </div>
                <h3 className="font-semibold text-slate-800 truncate text-sm" title={student.ten}>{student.ten}</h3>
                <p className="text-xs text-slate-500 mt-1 font-mono truncate" title={student.zoom_user_id || 'Khách'}>
                  {student.zoom_user_id || <span className="italic">Khách</span>}
                </p>
                <p className="text-[10px] text-slate-400 mt-2 font-medium">
                  {student.thoi_gian.toLocaleTimeString('vi-VN')}
                </p>
              </div>
            );
          })}
          
          {danh_sach_toan_bo.length === 0 && (
            <div className="col-span-full py-16 text-center text-slate-500 bg-white rounded-xl border border-dashed border-slate-300">
               <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-3">
                 <Users className="w-6 h-6 text-slate-400" />
               </div>
               <p className="font-medium text-sm">Chưa có học sinh nào tham gia lớp này.</p>
            </div>
          )}
        </div>
      )}

      {/* Save Modal */}
      {saveModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl border border-slate-200 shadow-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-bold text-slate-800 mb-2">Lưu danh sách lớp</h3>
            <p className="text-sm text-slate-500 mb-6">
               Hệ thống sẽ lưu lại toàn bộ <span className="font-bold text-slate-900">{danh_sach_toan_bo.length}</span> học sinh từng xuất hiện trong buổi học này.
            </p>
            
            <div className="space-y-5">
               <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Tạo nhóm mới</label>
                  <input 
                    type="text" 
                    placeholder="VD: Lớp Toán 10A"
                    className="w-full bg-slate-50 border-transparent focus:bg-white focus:border-brand-500 focus:ring-0 rounded-lg py-2.5 px-4 text-sm transition-all"
                    value={newGroupName}
                    onChange={e => { setNewGroupName(e.target.value); setSaveToExistingGroup(''); }}
                  />
               </div>
               
               <div className="flex items-center gap-3">
                 <div className="flex-1 h-px bg-slate-200"></div>
                 <div className="text-xs font-semibold text-slate-400 uppercase">Hoặc</div>
                 <div className="flex-1 h-px bg-slate-200"></div>
               </div>
               
               <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Ghi đè nhóm đã có</label>
                  <select 
                    className="w-full bg-slate-50 border-transparent focus:bg-white focus:border-brand-500 focus:ring-0 rounded-lg py-2.5 px-4 text-sm transition-all"
                    value={saveToExistingGroup}
                    onChange={e => { setSaveToExistingGroup(e.target.value); setNewGroupName(''); }}
                  >
                     <option value="">-- Chọn nhóm có sẵn --</option>
                     {groups.map(g => (
                       <option key={g.id} value={g.id}>{g.ten_nhom}</option>
                     ))}
                  </select>
               </div>
            </div>

            <div className="flex justify-end gap-3 mt-8 pt-4 border-t border-slate-100">
               <button 
                 onClick={() => setSaveModalOpen(false)}
                 className="px-5 py-2 text-slate-600 font-medium text-sm hover:bg-slate-50 rounded-lg transition-colors"
               >
                 Huỷ
               </button>
               <button 
                 onClick={handleQuickSave}
                 disabled={!newGroupName && !saveToExistingGroup}
                 className="bg-brand-600 text-white px-5 py-2 rounded-lg font-medium text-sm hover:bg-brand-700 transition-colors shadow-sm disabled:opacity-50 disabled:hover:bg-brand-600"
               >
                 Lưu danh sách
               </button>
            </div>
          </div>
        </div>
      )}

      {/* Popup điểm danh nhanh */}
      {attendanceOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl border border-slate-200 shadow-xl p-6 w-full max-w-lg">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-brand-600" /> Điểm danh nhanh
              </h3>
              <button onClick={() => setAttendanceOpen(false)} className="text-slate-400 hover:text-slate-700 transition-colors">
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <label className="block text-sm font-medium text-slate-600 mb-2">Chọn nhóm để đối chiếu</label>
            <select
              className="w-full bg-slate-50 border-transparent focus:bg-white focus:border-brand-500 focus:ring-0 rounded-lg py-2.5 px-4 text-sm transition-all"
              value={selectedGroupId}
              onChange={e => setSelectedGroupId(e.target.value)}
            >
              <option value="">-- Chọn nhóm --</option>
              {groups.map(g => (
                <option key={g.id} value={g.id}>{g.ten_nhom} ({g.hoc_sinh.length} HS)</option>
              ))}
            </select>

            {selectedGroup && (
              <div className="mt-5">
                {missingStudents.length > 0 ? (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <p className="text-red-800 font-semibold mb-3">
                      Đang thiếu {missingStudents.length}/{selectedGroup.hoc_sinh.length} bạn, các bạn thiếu bao gồm:
                    </p>
                    <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                      {missingStudents.map((s, i) => (
                        <div key={i} className="bg-white border border-dashed border-red-300 rounded-lg px-4 py-2 text-red-900 font-semibold text-sm">
                          {s.ten}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 text-emerald-800 font-medium flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5" /> Đủ sĩ số! Không thiếu bạn nào.
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end mt-6 pt-4 border-t border-slate-100">
              <button
                onClick={() => setAttendanceOpen(false)}
                className="bg-brand-600 text-white px-5 py-2 rounded-lg font-medium text-sm hover:bg-brand-700 transition-colors shadow-sm"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {toastMessage && (
        <div className="fixed bottom-4 right-4 bg-emerald-600 text-white px-6 py-3 rounded-xl shadow-lg font-medium text-sm z-50 flex items-center gap-3 animate-in slide-in-from-bottom-5">
           <CheckCircle2 className="w-5 h-5" />
           {toastMessage}
        </div>
      )}
    </div>
  );
}

function ManageGroups() {
  const navigate = useNavigate();
  const [groups, setGroups] = useState<StudentGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingGroup, setEditingGroup] = useState<StudentGroup | null>(null);

  useEffect(() => {
    const fetchGroups = async () => {
      const groupSnap = await getDocs(collection(db, 'student_groups'));
      const grps: StudentGroup[] = [];
      groupSnap.forEach(doc => {
        grps.push({ id: doc.id, ...doc.data() } as StudentGroup);
      });
      setGroups(grps);
      setLoading(false);
    };
    fetchGroups();
  }, []);

  const [groupToDelete, setGroupToDelete] = useState<{id: string, name: string} | null>(null);

  const confirmDelete = (id: string, name: string) => {
    setGroupToDelete({ id, name });
  };

  const handleDelete = async () => {
    if (groupToDelete) {
      await deleteDoc(doc(db, 'student_groups', groupToDelete.id));
      setGroups(groups.filter(g => g.id !== groupToDelete.id));
      setGroupToDelete(null);
    }
  };

  const exportExcel = (group: StudentGroup) => {
    const ws = XLSX.utils.json_to_sheet(group.hoc_sinh.map(hs => ({
      'Tên': hs.ten,
      'Email': hs.email || '',
      'Zoom ID': hs.zoom_id || ''
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Danh sách");
    XLSX.writeFile(wb, `${group.ten_nhom}.xlsx`);
  };

  if (editingGroup) {
    return <GroupEditor group={editingGroup} onClose={() => setEditingGroup(null)} onSave={(updatedGroup) => {
      if (!editingGroup.id) {
        setGroups([...groups, updatedGroup]);
      } else {
        setGroups(groups.map(g => g.id === updatedGroup.id ? updatedGroup : g));
      }
      setEditingGroup(null);
    }} />;
  }

  return (
    <div className="w-full flex flex-col flex-1 space-y-6">
      <div className="flex items-center justify-between bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-3">
          <Link to="/dashboard" className="text-slate-400 hover:text-slate-900 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h2 className="text-xl font-bold text-slate-800">Quản lý nhóm học sinh</h2>
        </div>
        <button 
          onClick={() => setEditingGroup({ id: '', ten_nhom: 'Nhóm mới', hoc_sinh: [], updated_at: new Date() })} 
          className="flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-lg font-medium text-sm hover:bg-brand-700 transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" /> Tạo nhóm
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><RefreshCw className="w-8 h-8 animate-spin text-slate-400" /></div>
      ) : (
        <div className="grid md:grid-cols-2 gap-6 w-full max-w-4xl">
          {groups.map(g => (
            <div key={g.id} className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow flex flex-col">
               <div className="flex justify-between items-start mb-4">
                  <div className="flex flex-col">
                    <span className="text-slate-500 text-sm font-medium">Nhóm</span>
                    <span className="text-xl font-bold mt-1 text-slate-900">{g.ten_nhom}</span>
                    <span className="text-sm font-medium text-brand-600 mt-1">{g.hoc_sinh.length} học sinh</span>
                  </div>
                  <div className="flex gap-2">
                     <button onClick={() => exportExcel(g)} className="p-2 text-emerald-600 bg-emerald-50 rounded-lg hover:bg-emerald-100 transition-colors" title="Xuất Excel">
                        <Download className="w-4 h-4" />
                     </button>
                     <button onClick={() => setEditingGroup(g)} className="px-3 py-2 text-brand-600 bg-brand-50 rounded-lg hover:bg-brand-100 transition-colors text-sm font-medium" title="Sửa nhóm">
                        Sửa
                     </button>
                     <button onClick={() => confirmDelete(g.id, g.ten_nhom)} className="p-2 text-rose-600 bg-rose-50 rounded-lg hover:bg-rose-100 transition-colors" title="Xoá nhóm">
                        <Trash2 className="w-4 h-4" />
                     </button>
                  </div>
               </div>
            </div>
          ))}
          
          {groups.length === 0 && (
             <div className="col-span-full py-16 text-center text-slate-500 bg-white rounded-xl border border-dashed border-slate-300">
                <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-3">
                  <BookOpen className="w-6 h-6 text-slate-400" />
                </div>
                <p className="font-medium text-sm">Chưa có nhóm nào. Vui lòng tạo nhóm mới hoặc lưu từ lớp học.</p>
             </div>
          )}
        </div>
      )}

      {groupToDelete && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden">
            <div className="p-6">
              <h3 className="text-lg font-bold text-slate-900 mb-2">Xác nhận xoá</h3>
              <p className="text-slate-600 text-sm">Bạn có chắc chắn muốn xoá nhóm "<span className="font-semibold text-slate-900">{groupToDelete.name}</span>"? Hành động này không thể hoàn tác.</p>
            </div>
            <div className="bg-slate-50 px-6 py-4 flex justify-end gap-3 border-t border-slate-100">
              <button onClick={() => setGroupToDelete(null)} className="px-4 py-2 text-slate-700 font-medium text-sm hover:bg-slate-200 rounded-lg transition-colors">
                Hủy
              </button>
              <button onClick={handleDelete} className="px-4 py-2 bg-rose-600 text-white font-medium text-sm hover:bg-rose-700 rounded-lg transition-colors">
                Xoá Nhóm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Tải file Excel mẫu để giáo viên điền rồi nhập lại (cột khớp với lúc "Xuất Excel").
const downloadSampleExcel = () => {
  const ws = XLSX.utils.json_to_sheet([
    { 'Tên': 'Nguyễn Văn A', 'Email': 'a@example.com', 'Zoom ID': '' },
    { 'Tên': 'Trần Thị B', 'Email': '', 'Zoom ID': '' },
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Danh sách');
  XLSX.writeFile(wb, 'mau_danh_sach_hoc_sinh.xlsx');
};

// Đọc file Excel người dùng chọn -> danh sách Student. Chấp nhận vài cách viết tên cột
// khác nhau (có dấu/không dấu, hoa/thường) cho đỡ khó chịu khi giáo viên tự gõ tiêu đề.
const parseStudentsFromExcel = async (file: File): Promise<Student[]> => {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

  const pick = (row: Record<string, unknown>, keys: string[]) => {
    for (const key of Object.keys(row)) {
      if (keys.includes(key.trim().toLowerCase())) {
        const val = String(row[key] ?? '').trim();
        if (val) return val;
      }
    }
    return '';
  };

  return rows
    .map(row => ({
      ten: pick(row, ['tên', 'ten', 'họ tên', 'ho ten', 'name']),
      email: pick(row, ['email']) || null,
      zoom_id: pick(row, ['zoom id', 'zoomid', 'zoom_id', 'id zoom']) || null,
    }))
    .filter(s => s.ten);
};

function GroupEditor({ group, onClose, onSave }: { group: StudentGroup, onClose: () => void, onSave: (g: StudentGroup) => void }) {
  const [name, setName] = useState(group.ten_nhom);
  const [students, setStudents] = useState<Student[]>(group.hoc_sinh);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // cho phép chọn lại cùng 1 file lần sau
    if (!file) return;

    try {
      const imported = await parseStudentsFromExcel(file);
      if (imported.length === 0) {
        setImportMsg('Không tìm thấy học sinh hợp lệ trong file (cần cột "Tên").');
      } else {
        setStudents(prev => [...prev, ...imported]);
        setImportMsg(`Đã nhập thêm ${imported.length} học sinh từ file.`);
      }
    } catch (err) {
      console.error('Lỗi đọc file Excel:', err);
      setImportMsg('Không đọc được file. Hãy chắc chắn đây là file .xlsx hợp lệ.');
    }
    setTimeout(() => setImportMsg(null), 4000);
  };

  const handleSave = async () => {
    const updated = {
      ten_nhom: name,
      hoc_sinh: students,
      updated_at: new Date()
    };
    
    if (group.id) {
      await updateDoc(doc(db, 'student_groups', group.id), updated);
      onSave({ ...group, ...updated });
    } else {
      const docRef = await addDoc(collection(db, 'student_groups'), updated);
      onSave({ ...group, ...updated, id: docRef.id });
    }
  };

  const removeStudent = (index: number) => {
    const newArr = [...students];
    newArr.splice(index, 1);
    setStudents(newArr);
  };

  const addStudent = () => {
    setStudents([...students, { ten: 'Học sinh mới', email: null, zoom_id: null }]);
  };

  const updateStudent = (index: number, field: keyof Student, value: string) => {
    const newArr = [...students];
    newArr[index] = { ...newArr[index], [field]: value || null };
    setStudents(newArr);
  };

  return (
    <div className="max-w-4xl w-full mx-auto bg-white rounded-xl shadow-sm border border-slate-200 p-8">
       <div className="flex justify-between items-center mb-8 border-b border-slate-100 pb-6">
          <div className="flex items-center gap-3">
             <button onClick={onClose} className="text-slate-400 hover:text-slate-700 transition-colors"><ArrowLeft className="w-5 h-5" /></button>
             <h2 className="text-xl font-bold text-slate-800">Chỉnh sửa nhóm</h2>
          </div>
          <button onClick={handleSave} className="bg-brand-600 text-white px-5 py-2 rounded-lg font-medium text-sm hover:bg-brand-700 transition-colors shadow-sm flex items-center gap-2">
             <Save className="w-4 h-4" /> Lưu thay đổi
          </button>
       </div>
       
       <div className="mb-8">
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Tên nhóm</label>
          <input 
            type="text" 
            className="w-full md:w-1/2 bg-slate-50 border-transparent focus:bg-white focus:border-brand-500 focus:ring-0 rounded-lg py-2.5 px-4 text-sm transition-all"
            value={name}
            onChange={e => setName(e.target.value)}
          />
       </div>

       <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
          <h3 className="font-semibold text-slate-800">Danh sách học sinh <span className="text-brand-600 bg-brand-50 px-2 py-0.5 rounded text-sm ml-2">{students.length}</span></h3>
          <div className="flex flex-wrap gap-2">
            <button onClick={downloadSampleExcel} className="text-slate-600 bg-slate-100 px-3 py-1.5 rounded-lg flex items-center gap-1 text-sm font-medium hover:bg-slate-200 transition-colors">
              <Download className="w-4 h-4" /> Tải file mẫu
            </button>
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImportFile} />
            <button onClick={() => fileInputRef.current?.click()} className="text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-lg flex items-center gap-1 text-sm font-medium hover:bg-emerald-100 transition-colors">
              <Upload className="w-4 h-4" /> Nhập từ Excel
            </button>
            <button onClick={addStudent} className="text-brand-600 bg-brand-50 px-3 py-1.5 rounded-lg flex items-center gap-1 text-sm font-medium hover:bg-brand-100 transition-colors">
              <Plus className="w-4 h-4" /> Thêm tay
            </button>
          </div>
       </div>

       {importMsg && (
          <div className="mb-4 text-sm bg-blue-50 border border-blue-200 text-blue-800 rounded-lg px-4 py-2">
            {importMsg}
          </div>
       )}

       <div className="space-y-3">
          {students.map((s, i) => (
             <div key={i} className="flex flex-col md:flex-row gap-4 items-start md:items-center p-4 bg-slate-50 border border-slate-100 rounded-lg hover:border-slate-200 transition-colors">
                <div className="flex-1 w-full">
                  <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1.5">Tên hiển thị</label>
                  <input type="text" value={s.ten} onChange={e => updateStudent(i, 'ten', e.target.value)} className="w-full p-2.5 border-transparent focus:border-brand-500 focus:ring-0 rounded bg-white text-sm shadow-sm" />
                </div>
                <div className="flex-1 w-full">
                  <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1.5">Email (tuỳ chọn)</label>
                  <input type="text" value={s.email || ''} onChange={e => updateStudent(i, 'email', e.target.value)} placeholder="Không bắt buộc" className="w-full p-2.5 border-transparent focus:border-brand-500 focus:ring-0 rounded bg-white text-sm shadow-sm" />
                </div>
                <div className="flex-1 w-full">
                  <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1.5">Zoom ID (để đối chiếu)</label>
                  <input type="text" value={s.zoom_id || ''} onChange={e => updateStudent(i, 'zoom_id', e.target.value)} placeholder="Trống sẽ so bằng tên" className="w-full p-2.5 border-transparent focus:border-brand-500 focus:ring-0 rounded bg-white text-sm font-mono shadow-sm" />
                </div>
                <div className="flex-none pt-[1.6rem]">
                   <button onClick={() => removeStudent(i)} className="p-2 text-rose-500 hover:bg-rose-100 hover:text-rose-600 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>
                </div>
             </div>
          ))}
       </div>
    </div>
  );
}
