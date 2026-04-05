

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as React from 'react';
import { useState, useEffect, useMemo } from 'react';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut, 
  User as FirebaseUser 
} from 'firebase/auth';
import { 
  collection, 
  doc, 
  getDoc, 
  setDoc, 
  onSnapshot, 
  query, 
  where, 
  addDoc, 
  updateDoc, 
  deleteDoc,
  serverTimestamp,
  Timestamp,
  getDocs,
  getDocFromServer
} from 'firebase/firestore';
import { auth, db } from './firebase';
import { 
  LayoutDashboard, 
  Users, 
  BookOpen, 
  CheckCircle, 
  XCircle, 
  QrCode, 
  MapPin, 
  LogOut, 
  Plus, 
  Trash2,
  FileText, 
  Clock, 
  ShieldCheck,
  ChevronRight,
  AlertCircle,
  Menu,
  X,
  GraduationCap
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { QRCodeSVG } from 'qrcode.react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell 
} from 'recharts';
import { format, isWithinInterval, addMinutes } from 'date-fns';
import { cn } from './lib/utils';
import Scanner from 'react-qr-scanner';

// --- Types ---
type Role = 'admin' | 'teacher' | 'student';

interface UserProfile {
  uid: string;
  email: string;
  name: string;
  role: Role;
  departmentId?: string;
  classId?: string;
  studentId?: string;
}

interface Department {
  id: string;
  name: string;
}

interface Class {
  id: string;
  name: string;
  departmentId: string;
  cycle: 'Licence' | 'Master';
  level: 'L1' | 'L2' | 'L3' | 'M1' | 'M2';
  program: string;
}

interface Course {
  id: string;
  title: string;
  teacherId: string;
  classId: string;
  type: 'PRESENTIEL' | 'EN_LIGNE';
  startTime: Timestamp;
  endTime: Timestamp;
  status: 'scheduled' | 'ongoing' | 'completed';
  qrCodeData?: string;
  location?: { lat: number; lng: number };
}

interface Attendance {
  id: string;
  courseId: string;
  studentId: string;
  status: 'present' | 'absent' | 'late' | 'justified';
  timestamp: Timestamp;
  method: 'manual' | 'qr' | 'online';
  location?: { lat: number; lng: number };
}

interface Justification {
  id: string;
  studentId: string;
  attendanceId: string;
  fileUrl: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  submittedAt: Timestamp;
}

// --- Error Handling ---

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string;
    email?: string | null;
    emailVerified?: boolean;
    isAnonymous?: boolean;
    tenantId?: string | null;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

class ErrorBoundary extends (React.Component as any) {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  render() {
    const { hasError, error } = (this as any).state;
    if (hasError) {
      let errorMessage = "Une erreur inattendue est survenue.";
      try {
        const parsed = JSON.parse(error.message);
        if (parsed.error) errorMessage = `Erreur Firestore: ${parsed.error}`;
      } catch (e) {
        errorMessage = error.message || errorMessage;
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
          <Card className="max-w-md w-full text-center">
            <AlertCircle className="w-12 h-12 text-rose-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-slate-900 mb-2">Oups ! Quelque chose s'est mal passé</h2>
            <p className="text-slate-500 mb-6">{errorMessage}</p>
            <Button onClick={() => window.location.reload()} className="w-full">
              Recharger l'application
            </Button>
          </Card>
        </div>
      );
    }
    return (this as any).props.children;
  }
}

// --- Components ---

const Button = ({ 
  children, 
  onClick, 
  variant = 'primary', 
  className, 
  disabled,
  type = 'button'
}: { 
  children: React.ReactNode; 
  onClick?: () => void; 
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline'; 
  className?: string;
  disabled?: boolean;
  type?: 'button' | 'submit';
}) => {
  const variants = {
    primary: 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm',
    secondary: 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm',
    danger: 'bg-rose-600 text-white hover:bg-rose-700 shadow-sm',
    ghost: 'bg-transparent text-slate-600 hover:bg-slate-100',
    outline: 'bg-transparent border border-slate-200 text-slate-600 hover:bg-slate-50'
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'px-4 py-2 rounded-lg font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2',
        variants[variant],
        className
      )}
    >
      {children}
    </button>
  );
};

const Card = ({ children, className, title, subtitle, key }: { children: React.ReactNode; className?: string; title?: string; subtitle?: string; key?: string | number }) => (
  <div className={cn('bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden', className)}>
    {(title || subtitle) && (
      <div className="px-6 py-4 border-b border-slate-100">
        {title && <h3 className="text-lg font-semibold text-slate-900">{title}</h3>}
        {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
      </div>
    )}
    <div className="p-6">{children}</div>
  </div>
);

const Badge = ({ children, variant = 'info' }: { children: React.ReactNode; variant?: 'success' | 'warning' | 'danger' | 'info' }) => {
  const variants = {
    success: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    warning: 'bg-amber-50 text-amber-700 border-amber-100',
    danger: 'bg-rose-50 text-rose-700 border-rose-100',
    info: 'bg-indigo-50 text-indigo-700 border-indigo-100'
  };
  return (
    <span className={cn('px-2.5 py-0.5 rounded-full text-xs font-medium border', variants[variant])}>
      {children}
    </span>
  );
};

// --- Main App ---

export default function AppWrapper() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}

function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [activeAdminTab, setActiveAdminTab] = useState<'overview' | 'users' | 'classes' | 'justifications'>('overview');
  const [activeTeacherTab, setActiveTeacherTab] = useState<'dashboard' | 'courses' | 'attendance'>('dashboard');
  const [activeStudentTab, setActiveStudentTab] = useState<'dashboard' | 'attendance' | 'justifications'>('dashboard');

  useEffect(() => {
    const testConnection = async () => {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if (error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration.");
        }
      }
    };
    testConnection();

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        const docRef = doc(db, 'users', firebaseUser.uid);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
          const existingProfile = docSnap.data() as UserProfile;
          let updatedRole = existingProfile.role;
          if (firebaseUser.email === 'ahassanimhoma20@gmail.com') updatedRole = 'admin';
          else if (firebaseUser.email === 'hassanimhoma2019@gmail.com') updatedRole = 'teacher';
          
          if (updatedRole !== existingProfile.role) {
            try {
              await updateDoc(docRef, { role: updatedRole });
              setProfile({ ...existingProfile, role: updatedRole });
            } catch (err) {
              handleFirestoreError(err, OperationType.UPDATE, 'users');
              setProfile(existingProfile);
            }
          } else {
            setProfile(existingProfile);
          }
        } else {
          let role: Role = 'student';
          if (firebaseUser.email === 'ahassanimhoma20@gmail.com') role = 'admin';
          else if (firebaseUser.email === 'hassanimhoma2019@gmail.com') role = 'teacher';
          
          const newProfile: UserProfile = {
            uid: firebaseUser.uid,
            email: firebaseUser.email || '',
            name: firebaseUser.displayName || 'Utilisateur',
            role
          };
          try {
            await setDoc(docRef, newProfile);
          } catch (err) {
            handleFirestoreError(err, OperationType.WRITE, 'users');
          }
          setProfile(newProfile);
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const handleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      console.error('Login error:', error);
      alert(`Erreur de connexion: ${error.message || 'Une erreur est survenue'}`);
    }
  };

  const handleLogout = () => signOut(auth);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-500 font-medium animate-pulse">Chargement d'EduAttend...</p>
        </div>
      </div>
    );
  }

  if (!user || !profile) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-slate-200 p-8 text-center"
        >
          <div className="w-16 h-16 bg-indigo-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <GraduationCap className="w-8 h-8 text-indigo-600" />
          </div>
          <h1 className="text-3xl font-bold text-slate-900 mb-2">EduAttend SaaS</h1>
          <p className="text-slate-500 mb-8">
            Gestion intelligente des présences universitaires. Connectez-vous pour accéder à votre espace.
          </p>
          <Button onClick={handleLogin} className="w-full py-3 text-lg">
            Se connecter avec Google
          </Button>
          <div className="mt-8 pt-8 border-t border-slate-100 text-sm text-slate-400">
            &copy; 2026 EduAttend. Tous droits réservés.
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar */}
      <aside className={cn(
        'fixed inset-y-0 left-0 z-50 w-64 bg-slate-900 text-slate-300 transition-transform duration-300 transform lg:translate-x-0 lg:static lg:inset-0',
        isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
      )}>
        <div className="h-full flex flex-col">
          <div className="p-6 flex items-center gap-3 border-b border-slate-800">
            <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center">
              <GraduationCap className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold text-white">EduAttend</span>
          </div>

          <nav className="flex-1 p-4 space-y-2">
            {profile.role === 'admin' && (
              <>
                <SidebarItem 
                  icon={<LayoutDashboard size={20} />} 
                  label="Dashboard" 
                  active={activeAdminTab === 'overview'} 
                  onClick={() => setActiveAdminTab('overview')}
                />
                <SidebarItem 
                  icon={<Users size={20} />} 
                  label="Utilisateurs" 
                  active={activeAdminTab === 'users'}
                  onClick={() => setActiveAdminTab('users')}
                />
                <SidebarItem 
                  icon={<BookOpen size={20} />} 
                  label="Classes & Cours" 
                  active={activeAdminTab === 'classes'}
                  onClick={() => setActiveAdminTab('classes')}
                />
                <SidebarItem 
                  icon={<FileText size={20} />} 
                  label="Justificatifs" 
                  active={activeAdminTab === 'justifications'}
                  onClick={() => setActiveAdminTab('justifications')}
                />
              </>
            )}
            {profile.role === 'teacher' && (
              <>
                <SidebarItem 
                  icon={<LayoutDashboard size={20} />} 
                  label="Dashboard" 
                  active={activeTeacherTab === 'dashboard'} 
                  onClick={() => setActiveTeacherTab('dashboard')}
                />
                <SidebarItem 
                  icon={<BookOpen size={20} />} 
                  label="Mes Cours" 
                  active={activeTeacherTab === 'courses'} 
                  onClick={() => setActiveTeacherTab('courses')}
                />
                <SidebarItem 
                  icon={<CheckCircle size={20} />} 
                  label="Présences" 
                  active={activeTeacherTab === 'attendance'} 
                  onClick={() => setActiveTeacherTab('attendance')}
                />
              </>
            )}
            {profile.role === 'student' && (
              <>
                <SidebarItem 
                  icon={<LayoutDashboard size={20} />} 
                  label="Dashboard" 
                  active={activeStudentTab === 'dashboard'} 
                  onClick={() => setActiveStudentTab('dashboard')}
                />
                <SidebarItem 
                  icon={<CheckCircle size={20} />} 
                  label="Mes Présences" 
                  active={activeStudentTab === 'attendance'} 
                  onClick={() => setActiveStudentTab('attendance')}
                />
                <SidebarItem 
                  icon={<FileText size={20} />} 
                  label="Mes Justificatifs" 
                  active={activeStudentTab === 'justifications'} 
                  onClick={() => setActiveStudentTab('justifications')}
                />
              </>
            )}
          </nav>

          <div className="p-4 border-t border-slate-800">
            <div className="flex items-center gap-3 mb-4 px-2">
              <div className="w-10 h-10 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-400 font-bold">
                {profile.name[0]}
              </div>
              <div className="overflow-hidden">
                <p className="text-sm font-medium text-white truncate">{profile.name}</p>
                <p className="text-xs text-slate-500 capitalize">{profile.role}</p>
              </div>
            </div>
            <Button variant="ghost" onClick={handleLogout} className="w-full justify-start text-slate-400 hover:text-white hover:bg-slate-800">
              <LogOut size={18} /> Déconnexion
            </Button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6">
          <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="lg:hidden text-slate-500">
            <Menu size={24} />
          </button>
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-2 text-sm text-slate-500">
              <span>{format(new Date(), 'EEEE d MMMM yyyy')}</span>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6">
          {profile.role === 'admin' && (
            <AdminDashboard 
              profile={profile} 
              activeTab={activeAdminTab} 
              setActiveTab={setActiveAdminTab} 
            />
          )}
          {profile.role === 'teacher' && (
            <TeacherDashboard 
              profile={profile} 
              activeTab={activeTeacherTab} 
              setActiveTab={setActiveTeacherTab} 
            />
          )}
          {profile.role === 'student' && (
            <StudentDashboard 
              profile={profile} 
              activeTab={activeStudentTab} 
              setActiveTab={setActiveStudentTab} 
            />
          )}
        </div>
      </main>
    </div>
  );
}

function SidebarItem({ icon, label, active = false, onClick }: { icon: React.ReactNode; label: string; active?: boolean; onClick?: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-left',
        active ? 'bg-indigo-600 text-white' : 'hover:bg-slate-800 text-slate-400 hover:text-slate-200'
      )}
    >
      {icon}
      <span className="font-medium">{label}</span>
    </button>
  );
}

// --- Dashboards ---

// --- Management Components ---

function AdminDashboard({ profile, activeTab, setActiveTab }: { 
  profile: UserProfile; 
  activeTab: 'overview' | 'users' | 'classes' | 'justifications';
  setActiveTab: (tab: 'overview' | 'users' | 'classes' | 'justifications') => void;
}) {
  const [stats, setStats] = useState({ students: 0, teachers: 0, classes: 0, ongoing: 0 });
  const [recentJustifications, setRecentJustifications] = useState<Justification[]>([]);
  const [ongoingSessions, setOngoingSessions] = useState<Course[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);

  useEffect(() => {
    const unsubUsers = onSnapshot(collection(db, 'users'), (snap) => {
      const users = snap.docs.map(d => d.data() as UserProfile);
      setStats(prev => ({
        ...prev,
        students: users.filter(u => u.role === 'student').length,
        teachers: users.filter(u => u.role === 'teacher').length
      }));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'users'));

    const unsubClasses = onSnapshot(collection(db, 'classes'), (snap) => {
      setStats(prev => ({ ...prev, classes: snap.size }));
      setClasses(snap.docs.map(d => ({ id: d.id, ...d.data() } as Class)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'classes'));

    const unsubJust = onSnapshot(query(collection(db, 'justifications'), where('status', '==', 'pending')), (snap) => {
      setRecentJustifications(snap.docs.map(d => ({ id: d.id, ...d.data() } as Justification)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'justifications'));

    const qOngoing = query(collection(db, 'courses'), where('status', '==', 'ongoing'));
    const unsubOngoing = onSnapshot(qOngoing, (snap) => {
      setStats(prev => ({ ...prev, ongoing: snap.size }));
      setOngoingSessions(snap.docs.map(d => ({ id: d.id, ...d.data() } as Course)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'courses'));

    return () => { unsubUsers(); unsubClasses(); unsubJust(); unsubOngoing(); };
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-900">Administration</h2>
        <div className="flex gap-2">
          <div className="flex bg-white p-1 rounded-lg border border-slate-200">
            {(['overview', 'users', 'classes', 'justifications'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  'px-3 py-1.5 text-xs font-medium rounded-md transition-all',
                  activeTab === tab ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'
                )}
              >
                {tab === 'classes' ? 'Classes & Cours' : tab === 'overview' ? 'Overview' : tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {activeTab === 'overview' && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <StatCard title="Étudiants" value={stats.students} icon={<Users className="text-indigo-600" />} />
            <StatCard title="Enseignants" value={stats.teachers} icon={<ShieldCheck className="text-emerald-600" />} />
            <StatCard title="Classes" value={stats.classes} icon={<BookOpen className="text-amber-600" />} />
            <StatCard title="En cours" value={stats.ongoing} icon={<Clock className="text-rose-600" />} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card title="Sessions en temps réel" subtitle="Cours actuellement en cours">
              <div className="space-y-4">
                {ongoingSessions.length === 0 ? (
                  <p className="text-center py-8 text-slate-500 italic">Aucune session active pour le moment.</p>
                ) : (
                  ongoingSessions.map(session => (
                    <div key={session.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-lg flex items-center justify-center">
                          <BookOpen size={20} />
                        </div>
                        <div>
                          <h4 className="font-bold text-slate-900">{session.title}</h4>
                          <p className="text-xs text-slate-500">{classes.find(c => c.id === session.classId)?.program || 'L3 Dev Web'}</p>
                        </div>
                      </div>
                      <Badge variant="success">En cours</Badge>
                    </div>
                  ))
                )}
              </div>
            </Card>
            
            <Card title="Justificatifs en attente" subtitle="Dernières demandes à valider">
              <div className="space-y-4">
                {recentJustifications.length === 0 ? (
                  <p className="text-slate-500 text-center py-8 italic">Aucun justificatif en attente.</p>
                ) : (
                  recentJustifications.slice(0, 5).map(j => (
                    <div key={j.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border border-slate-100">
                      <div>
                        <p className="font-medium text-slate-900">Demande #{j.id.slice(0, 5)}</p>
                        <p className="text-xs text-slate-500 truncate max-w-[200px]">{j.reason}</p>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="secondary" onClick={async () => {
                          try {
                            await updateDoc(doc(db, 'justifications', j.id), { status: 'approved' });
                            await updateDoc(doc(db, 'attendance', j.attendanceId), { status: 'justified' });
                          } catch (err) {
                            handleFirestoreError(err, OperationType.UPDATE, 'justifications/attendance');
                          }
                        }} className="text-xs py-1 px-2">Valider</Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </Card>
          </div>
        </>
      )}

      {activeTab === 'users' && <UserManagement />}
      {activeTab === 'classes' && <AcademicStructure />}
      {activeTab === 'justifications' && <JustificationManagement />}

      <AnimatePresence>
        {activeTab === 'users' && (
          <div className="hidden">
            {/* This is just a placeholder to ensure AnimatePresence works if needed */}
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function UserManagement() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCycle, setFilterCycle] = useState<string>('');
  const [filterLevel, setFilterLevel] = useState<string>('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);

  useEffect(() => {
    const unsubUsers = onSnapshot(collection(db, 'users'), (snap) => {
      setUsers(snap.docs.map(d => ({ uid: d.id, ...d.data() } as UserProfile)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'users'));

    const unsubDepts = onSnapshot(collection(db, 'departments'), (snap) => {
      setDepartments(snap.docs.map(d => ({ id: d.id, ...d.data() } as Department)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'departments'));

    const unsubClasses = onSnapshot(collection(db, 'classes'), (snap) => {
      setClasses(snap.docs.map(d => ({ id: d.id, ...d.data() } as Class)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'classes'));

    return () => {
      unsubUsers();
      unsubDepts();
      unsubClasses();
    };
  }, []);

  const deleteUser = async (uid: string) => {
    try {
      await deleteDoc(doc(db, 'users', uid));
      setConfirmDelete(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'users');
    }
  };

  const updateUserRole = async (uid: string, role: Role) => {
    try {
      await updateDoc(doc(db, 'users', uid), { role });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'users');
    }
  };

  const updateUserClass = async (uid: string, classId: string) => {
    try {
      await updateDoc(doc(db, 'users', uid), { classId: classId || null });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'users');
    }
  };

  const filteredUsers = users.filter(u => {
    const matchesSearch = u.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                         u.email.toLowerCase().includes(searchQuery.toLowerCase());
    
    if (!matchesSearch) return false;

    if (filterCycle || filterLevel) {
      const userClass = classes.find(c => c.id === u.classId);
      if (filterCycle && userClass?.cycle !== filterCycle) return false;
      if (filterLevel && userClass?.level !== filterLevel) return false;
    }

    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row items-center gap-4">
        <div className="relative flex-1 w-full">
          <input 
            type="text" 
            placeholder="Rechercher un utilisateur..." 
            className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <Users className="absolute left-3 top-2.5 text-slate-400" size={18} />
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          <select 
            value={filterCycle} 
            onChange={(e) => setFilterCycle(e.target.value)}
            className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">Tous les cycles</option>
            <option value="Licence">Licence</option>
            <option value="Master">Master</option>
          </select>
          <select 
            value={filterLevel} 
            onChange={(e) => setFilterLevel(e.target.value)}
            className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">Tous les niveaux</option>
            <option value="L1">L1</option>
            <option value="L2">L2</option>
            <option value="L3">L3</option>
            <option value="M1">M1</option>
            <option value="M2">M2</option>
          </select>
        </div>
        <Button onClick={() => setShowAddModal(true)} className="whitespace-nowrap">
          <Plus size={18} /> Ajouter
        </Button>
      </div>

      {showAddModal && (
        <Modal title="Ajouter un Utilisateur" onClose={() => setShowAddModal(false)}>
          <UserForm onComplete={() => setShowAddModal(false)} />
        </Modal>
      )}

      {editingUser && (
        <Modal title="Modifier l'Utilisateur" onClose={() => setEditingUser(null)}>
          <UserForm user={editingUser} onComplete={() => setEditingUser(null)} />
        </Modal>
      )}

      {confirmDelete && (
        <ConfirmModal 
          title="Supprimer l'utilisateur"
          message="Êtes-vous sûr de vouloir supprimer cet utilisateur ? Cette action est irréversible."
          onConfirm={() => deleteUser(confirmDelete)}
          onClose={() => setConfirmDelete(null)}
        />
      )}

      <Card title="Gestion des Utilisateurs" subtitle="Modifier les rôles et permissions">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-xs font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                <th className="px-4 py-3">Utilisateur</th>
                <th className="px-4 py-3">Rôle & Classe</th>
                <th className="px-4 py-3">Département</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredUsers.map(u => (
                <tr key={u.uid} className="text-sm hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-xs">
                        {u.name[0]}
                      </div>
                      <div>
                        <p className="font-medium text-slate-900">{u.name}</p>
                        <p className="text-xs text-slate-500">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex flex-col gap-2">
                      <select 
                        value={u.role} 
                        onChange={(e) => updateUserRole(u.uid, e.target.value as Role)}
                        className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                      >
                        <option value="student">Étudiant</option>
                        <option value="teacher">Enseignant</option>
                        <option value="admin">Admin</option>
                      </select>
                      {u.role === 'student' && (
                        <select 
                          value={u.classId || ''} 
                          onChange={(e) => updateUserClass(u.uid, e.target.value)}
                          className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                        >
                          <option value="">Assigner une classe</option>
                          {classes.map(c => (
                            <option key={c.id} value={c.id}>{c.level} - {c.program}</option>
                          ))}
                        </select>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-4 text-slate-500">
                    {departments.find(d => d.id === u.departmentId)?.name || 'Non assigné'}
                  </td>
                  <td className="px-4 py-4 text-right">
                    <div className="flex justify-end gap-2">
                      <Button 
                        variant="ghost" 
                        onClick={() => setEditingUser(u)}
                        className="text-xs p-1"
                      >
                        Modifier
                      </Button>
                      <Button 
                        variant="ghost" 
                        onClick={() => setConfirmDelete(u.uid)} 
                        className="text-xs p-1 text-rose-500 hover:text-rose-700 hover:bg-rose-50"
                      >
                        <Trash2 size={16} />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function JustificationManagement() {
  const [justifications, setJustifications] = useState<Justification[]>([]);

  useEffect(() => {
    return onSnapshot(collection(db, 'justifications'), (snap) => {
      setJustifications(snap.docs.map(d => ({ id: d.id, ...d.data() } as Justification)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'justifications'));
  }, []);

  const updateStatus = async (id: string, attendanceId: string, status: 'approved' | 'rejected') => {
    try {
      await updateDoc(doc(db, 'justifications', id), { status });
      if (status === 'approved') {
        await updateDoc(doc(db, 'attendance', attendanceId), { status: 'justified' });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'justifications/attendance');
    }
  };

  return (
    <div className="space-y-6">
      <Card title="Gestion des Justificatifs" subtitle="Valider ou rejeter les demandes d'absence">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-xs font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                <th className="px-4 py-3">Étudiant</th>
                <th className="px-4 py-3">Raison</th>
                <th className="px-4 py-3">Statut</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {justifications.map(j => (
                <tr key={j.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-4 font-medium text-slate-900">Demande #{j.id.slice(0, 5)}</td>
                  <td className="px-4 py-4 text-slate-500 text-sm">{j.reason}</td>
                  <td className="px-4 py-4">
                    <Badge variant={j.status === 'approved' ? 'success' : j.status === 'rejected' ? 'danger' : 'warning'}>
                      {j.status === 'approved' ? 'Approuvé' : j.status === 'rejected' ? 'Rejeté' : 'En attente'}
                    </Badge>
                  </td>
                  <td className="px-4 py-4 text-right">
                    {j.status === 'pending' && (
                      <div className="flex justify-end gap-2">
                        <Button variant="secondary" onClick={() => updateStatus(j.id, j.attendanceId, 'approved')} className="text-xs py-1 px-2">Approuver</Button>
                        <Button variant="outline" onClick={() => updateStatus(j.id, j.attendanceId, 'rejected')} className="text-xs py-1 px-2 text-rose-600 border-rose-200 hover:bg-rose-50">Rejeter</Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {justifications.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-slate-400 italic">
                    Aucun justificatif trouvé.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function AcademicStructure() {
  const [classes, setClasses] = useState<Class[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [showAddClassModal, setShowAddClassModal] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<{ type: 'class' | 'cycle' | 'level'; id: string; label: string } | null>(null);
  const [view, setView] = useState<{
    cycle?: 'Licence' | 'Master';
    level?: string;
    classId?: string;
  }>({});

  useEffect(() => {
    const unsubClasses = onSnapshot(collection(db, 'classes'), (snap) => {
      setClasses(snap.docs.map(d => ({ id: d.id, ...d.data() } as Class)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'classes'));

    const unsubUsers = onSnapshot(collection(db, 'users'), (snap) => {
      setUsers(snap.docs.map(d => d.data() as UserProfile));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'users'));

    const unsubDepts = onSnapshot(collection(db, 'departments'), (snap) => {
      setDepartments(snap.docs.map(d => ({ id: d.id, ...d.data() } as Department)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'departments'));

    return () => { unsubClasses(); unsubUsers(); unsubDepts(); };
  }, []);

  const deleteClass = async (id: string) => {
    try {
      // Check for students
      const students = users.filter(u => u.classId === id);
      if (students.length > 0) {
        alert(`Impossible de supprimer : ${students.length} étudiant(s) sont encore assignés à cette classe.`);
        return;
      }
      await deleteDoc(doc(db, 'classes', id));
      if (view.classId === id) setView({ cycle: view.cycle, level: view.level });
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'classes');
    }
  };

  const deleteCycle = async (cycle: string) => {
    try {
      const classesToDelete = classes.filter(c => c.cycle === cycle);
      for (const cls of classesToDelete) {
        const students = users.filter(u => u.classId === cls.id);
        if (students.length > 0) {
          alert(`Impossible de supprimer le cycle : la classe ${cls.program} contient des étudiants.`);
          return;
        }
      }
      for (const cls of classesToDelete) {
        await deleteDoc(doc(db, 'classes', cls.id));
      }
      setView({});
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'classes');
    }
  };

  const deleteLevel = async (cycle: string, level: string) => {
    try {
      const classesToDelete = classes.filter(c => c.cycle === cycle && c.level === level);
      for (const cls of classesToDelete) {
        const students = users.filter(u => u.classId === cls.id);
        if (students.length > 0) {
          alert(`Impossible de supprimer le niveau : la classe ${cls.program} contient des étudiants.`);
          return;
        }
      }
      for (const cls of classesToDelete) {
        await deleteDoc(doc(db, 'classes', cls.id));
      }
      setView({ cycle: view.cycle as 'Licence' | 'Master' });
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'classes');
    }
  };

  const [showAddDept, setShowAddDept] = useState(false);

  const addDepartment = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const name = formData.get('name') as string;
    try {
      await addDoc(collection(db, 'departments'), { name });
      setShowAddDept(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'departments');
    }
  };

  const clearAllData = async () => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer TOUTES les classes et départements ? Cette action est irréversible.')) return;
    try {
      const classesSnap = await getDocs(collection(db, 'classes'));
      for (const d of classesSnap.docs) await deleteDoc(doc(db, 'classes', d.id));
      
      const deptsSnap = await getDocs(collection(db, 'departments'));
      for (const d of deptsSnap.docs) await deleteDoc(doc(db, 'departments', d.id));
      
      alert('Toutes les données structurelles ont été supprimées.');
      setView({});
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'classes/departments');
    }
  };

  const cycles = ['Licence', 'Master'] as const;
  
  const levels = useMemo(() => {
    if (!view.cycle) return [];
    return Array.from(new Set(classes.filter(c => c.cycle === view.cycle).map(c => c.level))).sort();
  }, [classes, view.cycle]);

  const filteredClasses = useMemo(() => {
    if (!view.level) return [];
    return classes.filter(c => c.cycle === view.cycle && c.level === view.level);
  }, [classes, view.cycle, view.level]);

  const studentsInClass = useMemo(() => {
    if (!view.classId) return [];
    return users.filter(u => u.role === 'student' && u.classId === view.classId);
  }, [users, view.classId]);

  return (
    <div className="space-y-6">
      {/* Breadcrumbs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-sm text-slate-500 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-2 overflow-x-auto pb-2 sm:pb-0">
          <button onClick={() => setView({})} className="hover:text-indigo-600 font-bold text-slate-900 flex items-center gap-1">
            <GraduationCap size={16} className="text-indigo-600" />
            {departments[0]?.name || 'Structure'}
          </button>
          {view.cycle && (
            <>
              <ChevronRight size={14} className="text-slate-300 shrink-0" />
              <button onClick={() => setView({ cycle: view.cycle })} className="hover:text-indigo-600 font-medium whitespace-nowrap">{view.cycle}</button>
            </>
          )}
          {view.level && (
            <>
              <ChevronRight size={14} className="text-slate-300 shrink-0" />
              <button onClick={() => setView({ cycle: view.cycle, level: view.level })} className="hover:text-indigo-600 font-medium whitespace-nowrap">{view.level}</button>
            </>
          )}
          {view.classId && (
            <>
              <ChevronRight size={14} className="text-slate-300 shrink-0" />
              <span className="font-bold text-slate-900 whitespace-nowrap">{classes.find(c => c.id === view.classId)?.program}</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="primary" onClick={() => setShowAddClassModal(true)} className="text-xs h-9 px-4">
            <Plus size={16} /> Nouvelle Filière
          </Button>
          <Button variant="outline" onClick={() => setShowAddDept(true)} className="text-xs h-9 px-4">
            Département
          </Button>
          <Button variant="ghost" onClick={clearAllData} className="text-xs text-rose-500 hover:text-rose-700 hover:bg-rose-50 h-9 px-3">
            <Trash2 size={14} />
          </Button>
        </div>
      </div>

      {showAddDept && (
        <Modal title="Ajouter un Département" onClose={() => setShowAddDept(false)}>
          <form onSubmit={addDepartment} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Nom du Département</label>
              <input name="name" required placeholder="ex: Informatique" className="w-full px-4 py-2 rounded-lg border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div className="flex gap-3 pt-4">
              <Button variant="outline" type="button" onClick={() => setShowAddDept(false)} className="flex-1">Annuler</Button>
              <Button type="submit" className="flex-1">Ajouter</Button>
            </div>
          </form>
        </Modal>
      )}

      {!view.cycle && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {cycles.map(cycle => (
            <div key={cycle} className="relative group">
              <button 
                onClick={() => setView({ cycle })}
                className="w-full p-8 bg-white rounded-2xl border border-slate-200 shadow-sm hover:border-indigo-500 hover:shadow-md transition-all text-left"
              >
                <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center mb-4 group-hover:bg-indigo-600 transition-colors">
                  <GraduationCap className="text-indigo-600 group-hover:text-white" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-2">Cycle {cycle}</h3>
                <p className="text-slate-500 text-sm">Gérer les niveaux et filières du cycle {cycle.toLowerCase()}.</p>
                <div className="mt-6 flex items-center gap-2 text-indigo-600 font-medium text-sm">
                  Explorer <ChevronRight size={16} />
                </div>
              </button>
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmDelete({ type: 'cycle', id: cycle, label: `le cycle ${cycle}` });
                }}
                className="absolute top-4 right-4 p-2 text-slate-300 hover:text-rose-500 transition-colors"
              >
                <Trash2 size={18} />
              </button>
            </div>
          ))}
        </div>
      )}

      {view.cycle && !view.level && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {levels.length === 0 ? (
            <div className="col-span-full py-16 text-center bg-white rounded-2xl border-2 border-dashed border-slate-200">
              <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <BookOpen className="text-slate-300" size={32} />
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">Aucun niveau configuré</h3>
              <p className="text-slate-500 mb-8 max-w-sm mx-auto">
                Il n'y a pas encore de filières enregistrées pour le cycle {view.cycle}. 
                Ajoutez votre première filière pour commencer.
              </p>
              <Button onClick={() => setShowAddClassModal(true)} className="mx-auto">
                <Plus size={18} /> Ajouter une filière
              </Button>
            </div>
          ) : (
            levels.map(level => (
              <div key={level} className="relative group">
                <button 
                  onClick={() => setView({ ...view, level })}
                  className="w-full p-6 bg-white rounded-2xl border border-slate-200 shadow-sm hover:border-indigo-500 transition-all text-center"
                >
                  <div className="text-3xl font-black text-slate-200 mb-2">{level}</div>
                  <h3 className="text-lg font-bold text-slate-900">Année {level}</h3>
                  <p className="text-xs text-slate-500 mt-1">
                    {classes.filter(c => c.level === level).length} filières disponibles
                  </p>
                </button>
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    setConfirmDelete({ type: 'level', id: level, label: `le niveau ${level}` });
                  }}
                  className="absolute top-4 right-4 p-2 text-slate-300 hover:text-rose-500 transition-colors"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {view.level && !view.classId && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredClasses.map(cls => (
            <div key={cls.id} className="relative group">
              <button 
                onClick={() => setView({ ...view, classId: cls.id })}
                className="w-full p-6 bg-white rounded-2xl border border-slate-200 shadow-sm hover:border-indigo-500 transition-all text-left"
              >
                <div className="flex justify-between items-start mb-4">
                  <Badge variant="info">{cls.level}</Badge>
                  <div className="w-8 h-8 bg-slate-50 rounded-lg flex items-center justify-center">
                    <Users size={16} className="text-slate-400" />
                  </div>
                </div>
                <h3 className="font-bold text-slate-900 mb-1">{cls.program}</h3>
                <p className="text-xs text-slate-500">
                  {users.filter(u => u.role === 'student' && u.classId === cls.id).length} Étudiants inscrits
                </p>
              </button>
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmDelete({ type: 'class', id: cls.id, label: `la filière ${cls.program}` });
                }}
                className="absolute top-4 right-4 p-2 text-slate-300 hover:text-rose-500 transition-colors"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          <button 
            onClick={() => setShowAddClassModal(true)}
            className="p-6 border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center gap-2 text-slate-400 hover:border-indigo-300 hover:text-indigo-500 transition-all"
          >
            <Plus size={24} />
            <span className="text-sm font-medium">Ajouter une filière</span>
          </button>
        </div>
      )}

      {showAddClassModal && (
        <Modal title="Ajouter une Filière" onClose={() => setShowAddClassModal(false)}>
          <AddClassForm onComplete={() => setShowAddClassModal(false)} initialData={{ cycle: view.cycle, level: view.level }} />
        </Modal>
      )}

      {view.classId && (
        <Card 
          title={`Liste des Étudiants - ${classes.find(c => c.id === view.classId)?.program}`}
          subtitle={`${studentsInClass.length} étudiants inscrits dans cette classe`}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-xs font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                  <th className="px-4 py-3">Étudiant</th>
                  <th className="px-4 py-3">ID Étudiant</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {studentsInClass.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                      Aucun étudiant inscrit dans cette classe.
                    </td>
                  </tr>
                ) : (
                  studentsInClass.map(student => (
                    <tr key={student.uid} className="text-sm hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-4 font-medium text-slate-900">{student.name}</td>
                      <td className="px-4 py-4 text-slate-500 font-mono text-xs">{student.studentId || 'N/A'}</td>
                      <td className="px-4 py-4 text-slate-500">{student.email}</td>
                      <td className="px-4 py-4 text-right">
                        <Button variant="ghost" className="text-xs p-1">Voir Profil</Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {showAddClassModal && (
        <Modal title="Ajouter une Filière" onClose={() => setShowAddClassModal(false)}>
          <AddClassForm 
            onComplete={() => setShowAddClassModal(false)} 
            initialData={{ cycle: view.cycle, level: view.level }}
          />
        </Modal>
      )}

      {confirmDelete && (
        <ConfirmModal 
          title={`Supprimer ${confirmDelete.type === 'class' ? 'la filière' : confirmDelete.type === 'level' ? 'le niveau' : 'le cycle'}`}
          message={`Êtes-vous sûr de vouloir supprimer ${confirmDelete.label} ? Cette action supprimera toutes les données associées et est irréversible.`}
          onConfirm={() => {
            if (confirmDelete.type === 'class') deleteClass(confirmDelete.id);
            else if (confirmDelete.type === 'level') deleteLevel(view.cycle!, confirmDelete.id);
            else if (confirmDelete.type === 'cycle') deleteCycle(confirmDelete.id);
          }}
          onClose={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm">
      <motion.div 
        initial={{ scale: 0.95, opacity: 0 }} 
        animate={{ scale: 1, opacity: 1 }} 
        exit={{ scale: 0.95, opacity: 0 }} 
        className="bg-white rounded-2xl p-8 max-w-md w-full shadow-2xl relative"
      >
        <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors">
          <X size={24} />
        </button>
        <h3 className="text-xl font-bold text-slate-900 mb-6">{title}</h3>
        {children}
      </motion.div>
    </div>
  );
}

function ConfirmModal({ title, message, onConfirm, onClose, confirmLabel = "Supprimer", variant = "danger" }: { title: string; message: string; onConfirm: () => void; onClose: () => void; confirmLabel?: string; variant?: "danger" | "primary" }) {
  return (
    <Modal title={title} onClose={onClose}>
      <div className="space-y-6">
        <p className="text-slate-600">{message}</p>
        <div className="flex gap-3">
          <Button variant="outline" onClick={onClose} className="flex-1">Annuler</Button>
          <Button 
            variant={variant === "danger" ? "danger" : "primary"} 
            onClick={() => { onConfirm(); onClose(); }} 
            className="flex-1"
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function AddClassForm({ onComplete, initialData }: { onComplete: () => void; initialData?: { cycle?: string; level?: string } }) {
  const [departments, setDepartments] = useState<Department[]>([]);

  useEffect(() => {
    return onSnapshot(collection(db, 'departments'), (snap) => {
      setDepartments(snap.docs.map(d => ({ id: d.id, ...d.data() } as Department)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'departments'));
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const cycle = formData.get('cycle') as string;
    const level = formData.get('level') as string;
    const program = formData.get('program') as string;
    const departmentId = formData.get('departmentId') as string;

    if (!departmentId) {
      alert('Veuillez sélectionner un département.');
      return;
    }

    const data = {
      cycle,
      level,
      program,
      name: `${level} ${program}`,
      departmentId
    };

    try {
      await addDoc(collection(db, 'classes'), data);
      onComplete();
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'classes');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Département</label>
        <select name="departmentId" required className="w-full px-4 py-2 rounded-lg border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500">
          <option value="">Sélectionner un département</option>
          {departments.map(d => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Cycle</label>
          <select name="cycle" defaultValue={initialData?.cycle} className="w-full px-4 py-2 rounded-lg border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500">
            <option value="Licence">Licence</option>
            <option value="Master">Master</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Niveau</label>
          <select name="level" defaultValue={initialData?.level} className="w-full px-4 py-2 rounded-lg border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500">
            <option value="L1">L1</option>
            <option value="L2">L2</option>
            <option value="L3">L3</option>
            <option value="M1">M1</option>
            <option value="M2">M2</option>
          </select>
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Filière (Programme)</label>
        <input name="program" required placeholder="ex: Génie Logiciel" className="w-full px-4 py-2 rounded-lg border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500" />
      </div>
      <div className="flex gap-3 pt-4">
        <Button variant="outline" type="button" onClick={onComplete} className="flex-1">Annuler</Button>
        <Button type="submit" className="flex-1">Créer la filière</Button>
      </div>
    </form>
  );
}

function UserForm({ user, onComplete }: { user?: UserProfile; onComplete: () => void }) {
  const [role, setRole] = useState<Role>(user?.role || 'student');
  const [departments, setDepartments] = useState<Department[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);

  useEffect(() => {
    const unsubDepts = onSnapshot(collection(db, 'departments'), (snap) => {
      setDepartments(snap.docs.map(d => ({ id: d.id, ...d.data() } as Department)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'departments'));

    const unsubClasses = onSnapshot(collection(db, 'classes'), (snap) => {
      setClasses(snap.docs.map(d => ({ id: d.id, ...d.data() } as Class)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'classes'));

    return () => { unsubDepts(); unsubClasses(); };
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const email = formData.get('email') as string;
    const name = formData.get('name') as string;
    const selectedRole = formData.get('role') as Role;
    const studentId = formData.get('studentId') as string;
    const departmentId = formData.get('departmentId') as string;
    const classId = formData.get('classId') as string;

    try {
      if (!user) {
        const q = query(collection(db, 'users'), where('email', '==', email));
        const existing = await getDocs(q);
        
        if (!existing.empty) {
          alert('Un utilisateur avec cet email existe déjà.');
          return;
        }

        await addDoc(collection(db, 'users'), {
          email,
          name,
          role: selectedRole,
          departmentId: departmentId || null,
          classId: selectedRole === 'student' ? (classId || null) : null,
          studentId: selectedRole === 'student' ? (studentId || null) : null,
          createdAt: serverTimestamp()
        });
      } else {
        await updateDoc(doc(db, 'users', user.uid), {
          email,
          name,
          role: selectedRole,
          departmentId: departmentId || null,
          classId: selectedRole === 'student' ? (classId || null) : null,
          studentId: selectedRole === 'student' ? (studentId || null) : null,
        });
      }
      onComplete();
    } catch (err) {
      handleFirestoreError(err, user ? OperationType.UPDATE : OperationType.CREATE, 'users');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Nom Complet</label>
          <input 
            name="name" 
            defaultValue={user?.name}
            required 
            className="w-full px-4 py-2 rounded-lg border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500" 
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
          <input 
            name="email" 
            type="email" 
            defaultValue={user?.email}
            required 
            className="w-full px-4 py-2 rounded-lg border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500" 
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Rôle</label>
          <select 
            name="role" 
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
            className="w-full px-4 py-2 rounded-lg border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="student">Étudiant</option>
            <option value="teacher">Enseignant</option>
            <option value="admin">Administrateur</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Département</label>
          <select 
            name="departmentId" 
            defaultValue={user?.departmentId}
            className="w-full px-4 py-2 rounded-lg border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">Aucun département</option>
            {departments.map(d => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>
      </div>

      {role === 'student' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Classe / Filière</label>
            <select 
              name="classId" 
              defaultValue={user?.classId}
              className="w-full px-4 py-2 rounded-lg border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">Aucune classe</option>
              {classes.map(c => (
                <option key={c.id} value={c.id}>{c.level} - {c.program}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">ID Étudiant</label>
            <input 
              name="studentId" 
              defaultValue={user?.studentId}
              placeholder="ex: ETU-2026-001" 
              className="w-full px-4 py-2 rounded-lg border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500" 
            />
          </div>
        </div>
      )}

      <div className="flex gap-3 pt-4">
        <Button variant="outline" type="button" onClick={onComplete} className="flex-1">Annuler</Button>
        <Button type="submit" className="flex-1">{user ? 'Mettre à jour' : 'Ajouter'}</Button>
      </div>
    </form>
  );
}

// --- Student Components ---

import QrScanner from 'react-qr-scanner';

function TeacherDashboard({ profile, activeTab, setActiveTab }: { 
  profile: UserProfile; 
  activeTab: 'dashboard' | 'courses' | 'attendance';
  setActiveTab: (tab: 'dashboard' | 'courses' | 'attendance') => void;
}) {
  const [courses, setCourses] = useState<Course[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [activeCourse, setActiveCourse] = useState<Course | null>(null);
  const [showQR, setShowQR] = useState(false);
  const [showAttendance, setShowAttendance] = useState(false);
  const [attendanceList, setAttendanceList] = useState<Attendance[]>([]);
  const [showCreateCourse, setShowCreateCourse] = useState(false);
  const [allAttendance, setAllAttendance] = useState<Attendance[]>([]);

  useEffect(() => {
    const q = query(collection(db, 'courses'), where('teacherId', '==', profile.uid));
    const unsub = onSnapshot(q, (snap) => {
      setCourses(snap.docs.map(d => ({ id: d.id, ...d.data() } as Course)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'courses'));
    return unsub;
  }, [profile.uid]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'classes'), (snap) => {
      setClasses(snap.docs.map(d => ({ id: d.id, ...d.data() } as Class)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'classes'));
    return unsub;
  }, []);

  useEffect(() => {
    if (activeCourse) {
      const q = query(collection(db, 'attendance'), where('courseId', '==', activeCourse.id));
      return onSnapshot(q, (snap) => {
        setAttendanceList(snap.docs.map(d => ({ id: d.id, ...d.data() } as Attendance)));
      }, (err) => handleFirestoreError(err, OperationType.LIST, 'attendance'));
    }
  }, [activeCourse]);

  useEffect(() => {
    // Listen to all attendance for teacher's courses for the "Présences" tab
    if (courses.length > 0) {
      const courseIds = courses.map(c => c.id);
      // Firestore 'in' query limit is 10, but for now we'll assume it's fine or handle it simply
      const q = query(collection(db, 'attendance'), where('courseId', 'in', courseIds.slice(0, 10)));
      return onSnapshot(q, (snap) => {
        setAllAttendance(snap.docs.map(d => ({ id: d.id, ...d.data() } as Attendance)));
      }, (err) => handleFirestoreError(err, OperationType.LIST, 'attendance'));
    }
  }, [courses]);

  const startSession = async (courseId: string) => {
    try {
      const courseRef = doc(db, 'courses', courseId);
      const qrData = `eduattend-${courseId}-${Date.now()}`;
      await updateDoc(courseRef, { 
        status: 'ongoing', 
        qrCodeData: qrData 
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'courses');
    }
  };

  const endSession = async (courseId: string) => {
    try {
      await updateDoc(doc(db, 'courses', courseId), { status: 'completed' });
      setActiveCourse(null);
      setShowQR(false);
      setShowAttendance(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'courses');
    }
  };

  const createCourse = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const title = formData.get('title') as string;
    const type = formData.get('type') as 'PRESENTIEL' | 'EN_LIGNE';
    const classId = formData.get('classId') as string;
    
    if (!classId) {
      alert('Veuillez sélectionner une classe.');
      return;
    }

    try {
      await addDoc(collection(db, 'courses'), {
        title,
        type,
        teacherId: profile.uid,
        classId,
        startTime: Timestamp.now(),
        endTime: Timestamp.fromDate(addMinutes(new Date(), 90)),
        status: 'scheduled'
      });
      setShowCreateCourse(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'courses');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-900">
          {activeTab === 'dashboard' && "Tableau de Bord"}
          {activeTab === 'courses' && "Mes Sessions de Cours"}
          {activeTab === 'attendance' && "Gestion des Présences"}
        </h2>
        {activeTab === 'courses' && (
          <Button onClick={() => setShowCreateCourse(true)} className="gap-2">
            <Plus size={18} /> Programmer un cours
          </Button>
        )}
      </div>

      {activeTab === 'dashboard' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <StatCard title="Total Cours" value={courses.length} icon={<BookOpen className="text-indigo-600" />} />
          <StatCard title="Cours Actifs" value={courses.filter(c => c.status === 'ongoing').length} icon={<Clock className="text-emerald-600" />} />
          <StatCard title="Présences Totales" value={allAttendance.length} icon={<Users className="text-amber-600" />} />
          
          <Card className="md:col-span-3" title="Session en cours" subtitle="Gérez votre cours actuel">
            {courses.filter(c => c.status === 'ongoing').length === 0 ? (
              <div className="text-center py-12">
                <p className="text-slate-500">Aucune session active. Allez dans "Mes Cours" pour en démarrer une.</p>
                <Button variant="outline" onClick={() => setActiveTab('courses')} className="mt-4">
                  Voir mes cours
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {courses.filter(c => c.status === 'ongoing').map(course => (
                  <div key={course.id} className="p-4 border border-indigo-100 bg-indigo-50 rounded-xl flex justify-between items-center">
                    <div>
                      <h4 className="font-bold text-slate-900">{course.title}</h4>
                      <p className="text-sm text-indigo-600">{classes.find(cl => cl.id === course.classId)?.program || 'Classe inconnue'}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={() => { setActiveCourse(course); setShowQR(true); }} variant="outline" className="h-9 px-3">
                        <QrCode size={16} />
                      </Button>
                      <Button onClick={() => { setActiveCourse(course); setShowAttendance(true); }} variant="outline" className="h-9 px-3">
                        <Users size={16} />
                      </Button>
                      <Button onClick={() => endSession(course.id)} variant="danger" className="h-9 px-3">
                        <X size={16} />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {activeTab === 'courses' && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {courses.length === 0 ? (
            <div className="col-span-full py-16 text-center bg-white rounded-2xl border-2 border-dashed border-slate-200">
              <BookOpen className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <h3 className="text-lg font-bold text-slate-900">Aucun cours programmé</h3>
              <p className="text-slate-500 mb-6">Commencez par programmer votre premier cours.</p>
              <Button onClick={() => setShowCreateCourse(true)}>Programmer un cours</Button>
            </div>
          ) : (
            courses.map(course => (
              <Card key={course.id} className="relative">
                <div className="flex justify-between items-start mb-4">
                  <Badge variant={course.type === 'PRESENTIEL' ? 'info' : 'success'}>
                    {course.type}
                  </Badge>
                  {course.status === 'ongoing' && (
                    <span className="flex h-2 w-2 rounded-full bg-rose-500 animate-ping" />
                  )}
                </div>
                <h3 className="text-lg font-bold text-slate-900 mb-1">{course.title}</h3>
                <div className="space-y-2 text-sm text-slate-500 mb-6">
                  <div className="flex items-center gap-2">
                    <Clock size={16} /> 
                    {format(course.startTime.toDate(), 'HH:mm')} - {format(course.endTime.toDate(), 'HH:mm')}
                  </div>
                  <div className="flex items-center gap-2">
                    <Users size={16} /> 
                    Classe: {classes.find(cl => cl.id === course.classId)?.program || 'L3 Dev Web'}
                  </div>
                </div>
                
                {course.status === 'scheduled' ? (
                  <Button onClick={() => startSession(course.id)} className="w-full">
                    Démarrer la session
                  </Button>
                ) : course.status === 'ongoing' ? (
                  <div className="flex flex-col gap-2">
                    <div className="flex gap-2">
                      <Button onClick={() => { setActiveCourse(course); setShowQR(true); }} variant="outline" className="flex-1">
                        <QrCode size={18} /> QR Code
                      </Button>
                      <Button onClick={() => { setActiveCourse(course); setShowAttendance(true); }} variant="outline" className="flex-1">
                        <Users size={18} /> Liste
                      </Button>
                    </div>
                    <Button onClick={() => endSession(course.id)} variant="secondary" className="w-full">
                      Terminer la session
                    </Button>
                  </div>
                ) : (
                  <Button disabled className="w-full bg-slate-100 text-slate-400 border-none">
                    Session terminée
                  </Button>
                )}
              </Card>
            ))
          )}
        </div>
      )}

      {activeTab === 'attendance' && (
        <Card title="Historique des Présences" subtitle="Consultez les émargements de vos cours">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-xs font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                  <th className="px-4 py-3">Cours</th>
                  <th className="px-4 py-3">Étudiant</th>
                  <th className="px-4 py-3">Date & Heure</th>
                  <th className="px-4 py-3">Méthode</th>
                  <th className="px-4 py-3">Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {allAttendance.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-500 italic">
                      Aucune présence enregistrée pour le moment.
                    </td>
                  </tr>
                ) : (
                  allAttendance.sort((a, b) => b.timestamp.toMillis() - a.timestamp.toMillis()).map(att => (
                    <tr key={att.id} className="text-sm hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-4 font-medium text-slate-900">
                        {courses.find(c => c.id === att.courseId)?.title || 'Cours inconnu'}
                      </td>
                      <td className="px-4 py-4 text-slate-600">
                        Étudiant #{att.studentId.slice(0, 5)}
                      </td>
                      <td className="px-4 py-4 text-slate-500">
                        {format(att.timestamp.toDate(), 'dd/MM/yyyy HH:mm:ss')}
                      </td>
                      <td className="px-4 py-4">
                        <Badge variant="info">{att.method}</Badge>
                      </td>
                      <td className="px-4 py-4">
                        <Badge variant={att.status === 'present' ? 'success' : 'warning'}>
                          {att.status}
                        </Badge>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <AnimatePresence>
        {showCreateCourse && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="bg-white rounded-2xl p-8 max-w-md w-full shadow-2xl">
              <h3 className="text-xl font-bold text-slate-900 mb-6">Programmer un cours</h3>
              <form onSubmit={createCourse} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Titre du cours</label>
                  <input name="title" required className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Classe</label>
                  <select name="classId" required className="w-full px-4 py-2 rounded-lg border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500">
                    <option value="">Sélectionner une classe</option>
                    {classes.map(c => (
                      <option key={c.id} value={c.id}>{c.level} - {c.program}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Type de cours</label>
                  <select name="type" className="w-full px-4 py-2 rounded-lg border border-slate-200 outline-none">
                    <option value="PRESENTIEL">Présentiel</option>
                    <option value="EN_LIGNE">En Ligne</option>
                  </select>
                </div>
                <div className="flex gap-3 pt-4">
                  <Button variant="outline" onClick={() => setShowCreateCourse(false)} className="flex-1">Annuler</Button>
                  <Button type="submit" className="flex-1">Créer</Button>
                </div>
              </form>
            </motion.div>
          </div>
        )}

        {showQR && activeCourse && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="bg-white rounded-2xl p-8 max-w-sm w-full text-center shadow-2xl">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-slate-900">QR Code</h3>
                <button onClick={() => setShowQR(false)} className="text-slate-400 hover:text-slate-600"><X size={24} /></button>
              </div>
              <div className="bg-slate-50 p-6 rounded-xl border border-slate-100 mb-6 flex justify-center">
                <QRCodeSVG value={activeCourse.qrCodeData || ''} size={200} />
              </div>
              <Button onClick={() => setShowQR(false)} className="w-full">Fermer</Button>
            </motion.div>
          </div>
        )}

        {showAttendance && activeCourse && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="bg-white rounded-2xl p-8 max-w-lg w-full shadow-2xl max-h-[80vh] flex flex-col">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-slate-900">Présences en temps réel ({attendanceList.length})</h3>
                <button onClick={() => setShowAttendance(false)} className="text-slate-400 hover:text-slate-600"><X size={24} /></button>
              </div>
              <div className="flex-1 overflow-y-auto space-y-3 pr-2">
                {attendanceList.length === 0 ? (
                  <p className="text-center text-slate-500 py-8">Aucun étudiant n'a encore validé sa présence.</p>
                ) : (
                  attendanceList.map(att => (
                    <div key={att.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-100">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-xs">
                          {att.studentId.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-slate-900">Étudiant #{att.studentId.slice(0, 5)}</p>
                          <p className="text-[10px] text-slate-400">{format(att.timestamp.toDate(), 'HH:mm:ss')}</p>
                        </div>
                      </div>
                      <Badge variant="success">{att.method}</Badge>
                    </div>
                  ))
                )}
              </div>
              <Button onClick={() => setShowAttendance(false)} className="mt-6 w-full">Fermer</Button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function StudentDashboard({ profile, activeTab, setActiveTab }: { 
  profile: UserProfile;
  activeTab: 'dashboard' | 'attendance' | 'justifications';
  setActiveTab: (tab: 'dashboard' | 'attendance' | 'justifications') => void;
}) {
  const [myAttendance, setMyAttendance] = useState<Attendance[]>([]);
  const [ongoingCourses, setOngoingCourses] = useState<Course[]>([]);
  const [isCheckingIn, setIsCheckingIn] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [showJustify, setShowJustify] = useState<string | null>(null);

  useEffect(() => {
    const qAtt = query(collection(db, 'attendance'), where('studentId', '==', profile.uid));
    const unsubAtt = onSnapshot(qAtt, (snap) => {
      setMyAttendance(snap.docs.map(d => ({ id: d.id, ...d.data() } as Attendance)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'attendance'));

    const qCourses = profile.classId 
      ? query(collection(db, 'courses'), where('status', '==', 'ongoing'), where('classId', '==', profile.classId))
      : query(collection(db, 'courses'), where('status', '==', 'ongoing'));
    
    const unsubCourses = onSnapshot(qCourses, (snap) => {
      setOngoingCourses(snap.docs.map(d => ({ id: d.id, ...d.data() } as Course)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'courses'));

    return () => { unsubAtt(); unsubCourses(); };
  }, [profile.uid, profile.classId]);

  const handleScan = async (data: any) => {
    if (data && data.text && !isCheckingIn) {
      const qrText = data.text;
      const course = ongoingCourses.find(c => c.qrCodeData === qrText);
      if (course) {
        await handleCheckIn(course.id, 'qr');
        setShowScanner(false);
      }
    }
  };

  const handleCheckIn = async (courseId: string, method: 'qr' | 'online' = 'online') => {
    setIsCheckingIn(true);
    try {
      const pos = await new Promise<GeolocationPosition>((res, rej) => {
        navigator.geolocation.getCurrentPosition(res, rej, { timeout: 5000 });
      }).catch(() => null);
      
      await addDoc(collection(db, 'attendance'), {
        courseId,
        studentId: profile.uid,
        status: 'present',
        timestamp: serverTimestamp(),
        method,
        location: pos ? { lat: pos.coords.latitude, lng: pos.coords.longitude } : null
      });
      alert('Présence enregistrée avec succès !');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'attendance');
    } finally {
      setIsCheckingIn(false);
    }
  };

  const attendanceRate = useMemo(() => {
    if (myAttendance.length === 0) return 0;
    const present = myAttendance.filter(a => a.status === 'present' || a.status === 'justified').length;
    return Math.round((present / 10) * 100);
  }, [myAttendance]);

  return (
    <div className="space-y-6">
      {activeTab === 'dashboard' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2" title="Cours en cours" subtitle="Marquez votre présence maintenant">
            <div className="space-y-4">
              {ongoingCourses.length === 0 ? (
                <div className="text-center py-12">
                  <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Clock className="text-slate-300" size={32} />
                  </div>
                  <p className="text-slate-500">Aucun cours actif pour le moment.</p>
                </div>
              ) : (
                ongoingCourses.map(course => (
                  <div key={course.id} className="flex items-center justify-between p-4 bg-indigo-50 border border-indigo-100 rounded-xl">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-white rounded-lg flex items-center justify-center shadow-sm">
                        {course.type === 'PRESENTIEL' ? <QrCode className="text-indigo-600" /> : <MapPin className="text-emerald-600" />}
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-900">{course.title}</h4>
                        <p className="text-xs text-indigo-600 font-medium uppercase">{course.type}</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {course.type === 'PRESENTIEL' ? (
                        <Button onClick={() => setShowScanner(true)} variant="primary">
                          Scanner QR
                        </Button>
                      ) : (
                        <Button onClick={() => handleCheckIn(course.id)} disabled={isCheckingIn} variant="secondary">
                          {isCheckingIn ? 'Validation...' : 'Je suis présent'}
                        </Button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>

          <Card title="Mon Assiduité" subtitle="Taux de présence global">
            <div className="flex flex-col items-center justify-center py-6">
              <div className="relative w-40 h-40 flex items-center justify-center">
                <svg className="w-full h-full transform -rotate-90">
                  <circle cx="80" cy="80" r="70" stroke="currentColor" strokeWidth="12" fill="transparent" className="text-slate-100" />
                  <circle 
                    cx="80" cy="80" r="70" stroke="currentColor" strokeWidth="12" fill="transparent" 
                    strokeDasharray={440} 
                    strokeDashoffset={440 - (440 * attendanceRate) / 100}
                    className={cn('transition-all duration-1000', attendanceRate > 80 ? 'text-emerald-500' : 'text-amber-500')}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-3xl font-bold text-slate-900">{attendanceRate}%</span>
                  <span className="text-xs text-slate-500 font-medium">Objectif: 80%</span>
                </div>
              </div>
              <div className="mt-6 w-full space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Présences</span>
                  <span className="font-bold text-slate-900">{myAttendance.filter(a => a.status === 'present').length}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Absences</span>
                  <span className="font-bold text-slate-900">{myAttendance.filter(a => a.status === 'absent').length}</span>
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}

      {activeTab === 'attendance' && (
        <Card title="Historique complet" subtitle="Vos présences enregistrées">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-xs font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                  <th className="px-4 py-3">Cours</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Statut</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {myAttendance.length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-400">Aucun historique disponible.</td></tr>
                ) : (
                  myAttendance.sort((a, b) => b.timestamp.toMillis() - a.timestamp.toMillis()).map(att => (
                    <tr key={att.id} className="text-sm">
                      <td className="px-4 py-4 font-medium text-slate-900">Cours #{att.courseId.slice(0, 5)}</td>
                      <td className="px-4 py-4 text-slate-500">{format(att.timestamp.toDate(), 'dd/MM/yyyy HH:mm')}</td>
                      <td className="px-4 py-4"><Badge variant={att.status === 'present' ? 'success' : att.status === 'justified' ? 'info' : 'danger'}>{att.status}</Badge></td>
                      <td className="px-4 py-4">
                        {att.status === 'absent' && (
                          <Button variant="outline" onClick={() => setShowJustify(att.id)} className="text-xs py-1">Justifier</Button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {activeTab === 'justifications' && (
        <Card title="Mes Justificatifs" subtitle="Suivi de vos demandes d'absence">
          <p className="text-slate-500 text-center py-12">Historique des justificatifs en cours de développement.</p>
        </Card>
      )}

      <AnimatePresence>
        {showScanner && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="bg-white rounded-2xl p-8 max-w-sm w-full text-center shadow-2xl">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-slate-900">Scanner QR Code</h3>
                <button onClick={() => setShowScanner(false)} className="text-slate-400 hover:text-slate-600"><X size={24} /></button>
              </div>
              <div className="bg-slate-50 rounded-xl overflow-hidden mb-6 aspect-square flex items-center justify-center border border-slate-100">
                <QrScanner delay={300} onError={(err: any) => console.error(err)} onScan={handleScan} style={{ width: '100%' }} />
              </div>
              <Button onClick={() => setShowScanner(false)} variant="outline" className="w-full">Annuler</Button>
            </motion.div>
          </div>
        )}

        {showScanner && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="bg-white rounded-2xl p-8 max-w-sm w-full text-center shadow-2xl">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-slate-900">Scanner QR Code</h3>
                <button onClick={() => setShowScanner(false)} className="text-slate-400 hover:text-slate-600"><X size={24} /></button>
              </div>
              <div className="bg-slate-50 rounded-xl border border-slate-100 mb-6 overflow-hidden aspect-square">
                <Scanner
                  delay={300}
                  onError={(err: any) => console.error(err)}
                  onScan={handleScan}
                  style={{ width: '100%' }}
                />
              </div>
              <Button onClick={() => setShowScanner(false)} variant="outline" className="w-full">Annuler</Button>
            </motion.div>
          </div>
        )}

        {showJustify && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="bg-white rounded-2xl p-8 max-w-md w-full shadow-2xl">
              <h3 className="text-xl font-bold text-slate-900 mb-6">Soumettre un justificatif</h3>
              <form onSubmit={async (e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                const reason = formData.get('reason') as string;
                try {
                  await addDoc(collection(db, 'justifications'), {
                    studentId: profile.uid,
                    attendanceId: showJustify,
                    reason,
                    fileUrl: 'demo-file-url',
                    status: 'pending',
                    submittedAt: serverTimestamp()
                  });
                  setShowJustify(null);
                  alert('Justificatif soumis.');
                } catch (err) {
                  handleFirestoreError(err, OperationType.CREATE, 'justifications');
                }
              }} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Raison de l'absence</label>
                  <textarea name="reason" required className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none h-32" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Fichier (PDF/Image)</label>
                  <input type="file" className="w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100" />
                </div>
                <div className="flex gap-3 pt-4">
                  <Button variant="outline" onClick={() => setShowJustify(null)} className="flex-1">Annuler</Button>
                  <Button type="submit" className="flex-1">Envoyer</Button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function StatCard({ title, value, icon }: { title: string; value: string | number; icon: React.ReactNode }) {
  return (
    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
      <div className="w-12 h-12 rounded-xl bg-slate-50 flex items-center justify-center">
        {icon}
      </div>
      <div>
        <p className="text-sm font-medium text-slate-500">{title}</p>
        <p className="text-2xl font-bold text-slate-900">{value}</p>
      </div>
    </div>
  );
}
