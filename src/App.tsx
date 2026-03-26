import { AnimatePresence, motion } from 'motion/react';
import { 
  AlertCircle, 
  ArrowLeft, 
  Camera, 
  CheckCircle2, 
  ChevronRight, 
  Clock, 
  Filter, 
  LayoutDashboard, 
  List, 
  LogOut, 
  Map as MapIcon, 
  Menu, 
  Moon, 
  Plus, 
  Search, 
  Settings, 
  Sun, 
  User, 
  Wrench,
  X
} from 'lucide-react';
import React, { lazy, Suspense, useEffect, useState } from 'react';
import { 
  isSignInWithEmailLink, 
  onAuthStateChanged, 
  sendSignInLinkToEmail, 
  signInWithEmailLink, 
  signOut 
} from 'firebase/auth';
import { 
  onValue, 
  push, 
  ref, 
  set, 
  update 
} from 'firebase/database';
import { auth, db } from './firebase';
import { CATEGORIES, PRIORITIES, Store, STORES, TICKET_STATUS_CONFIG } from './constants';
import { cn } from './lib/utils';

// Lazy load Map component
const Map = lazy(() => import('./components/Map'));

// --- Types ---
interface UserProfile {
  uid: string;
  email: string;
  name: string;
  role: string;
  stores: string | string[];
}

interface Ticket {
  id: string;
  _key?: string;
  storeCode: string;
  storeName: string;
  brand: string;
  category: string;
  location?: string;
  description: string;
  priority: 'routine' | 'urgent' | 'emergency';
  status: keyof typeof TICKET_STATUS_CONFIG;
  createdAt: number;
  updatedAt: number;
  createdBy: string;
  createdByName: string;
  photos?: string[];
}

// --- Components ---

const LoadingScreen = () => (
  <div className="fixed inset-0 bg-slate-50 flex flex-col items-center justify-center z-50">
    <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
    <p className="text-slate-600 font-medium animate-pulse">Loading Dossani R&M...</p>
  </div>
);

const Badge = ({ status }: { status: keyof typeof TICKET_STATUS_CONFIG }) => {
  const config = TICKET_STATUS_CONFIG[status] || TICKET_STATUS_CONFIG.unassigned;
  return (
    <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border", config.color)}>
      {config.label}
    </span>
  );
};

export default function App() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [loginSent, setLoginSent] = useState(false);
  const [error, setError] = useState('');
  const [currentScreen, setCurrentScreen] = useState<'home' | 'new-ticket' | 'tickets' | 'admin'>('home');
  const [selectedStore, setSelectedStore] = useState<Store | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [showMap, setShowMap] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  // New Ticket Form State
  const [formCategory, setFormCategory] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formPriority, setFormPriority] = useState<'routine' | 'urgent' | 'emergency'>('routine');
  const [formLocation, setFormLocation] = useState('interior');
  const [formPhotos, setFormPhotos] = useState<string[]>([]);
  const [activeClockIn, setActiveClockIn] = useState<{
    ticketId: string;
    startTime: number;
    storeName: string;
  } | null>(null);

  // --- Tech Logic ---
  const handleClockIn = (ticket: Ticket) => {
    if (activeClockIn) {
      alert('Already clocked into a job. Clock out first.');
      return;
    }
    const now = Date.now();
    setActiveClockIn({
      ticketId: ticket.id,
      startTime: now,
      storeName: ticket.storeName
    });
    // Update ticket status to in-progress
    update(ref(db, `tickets/${ticket.id}`), {
      status: 'inprogress',
      updatedAt: now
    });
  };

  const handleClockOut = async (ticketId: string) => {
    if (!activeClockIn) return;
    const now = Date.now();
    
    // Save time entry
    const timeEntryRef = ref(db, 'timeEntries');
    await push(timeEntryRef, {
      techEmail: user?.email,
      ticketId,
      startTime: activeClockIn.startTime,
      endTime: now,
      duration: now - activeClockIn.startTime
    });

    setActiveClockIn(null);
    alert('Clocked out successfully!');
  };

  // --- Render Helpers ---
  const renderAdminSummary = () => {
    const stats = {
      unassigned: tickets.filter(t => t.status === 'unassigned').length,
      inprogress: tickets.filter(t => t.status === 'inprogress').length,
      waiting: tickets.filter(t => t.status === 'waiting').length,
      resolved: tickets.filter(t => t.status === 'resolved').length,
    };

    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {Object.entries(stats).map(([key, val]) => (
          <div key={key} className={cn("p-4 rounded-2xl border text-center", isDarkMode ? "bg-slate-800 border-slate-700" : "bg-white border-slate-200")}>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{key}</p>
            <p className="text-2xl font-black">{val}</p>
          </div>
        ))}
      </div>
    );
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // Fetch user profile from DB
        const userRef = ref(db, `users/${firebaseUser.uid}`);
        onValue(userRef, (snapshot) => {
          const data = snapshot.val();
          if (data) {
            setUser({
              uid: firebaseUser.uid,
              email: firebaseUser.email || '',
              ...data
            });
          } else {
            // New user, potentially pending
            setUser({
              uid: firebaseUser.uid,
              email: firebaseUser.email || '',
              name: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User',
              role: 'Manager',
              stores: []
            });
          }
          setLoading(false);
        });
      } else {
        setUser(null);
        setLoading(false);
      }
    });

    // Handle Email Link Sign In
    if (isSignInWithEmailLink(auth, window.location.href)) {
      let emailForSignIn = window.localStorage.getItem('emailForSignIn');
      if (!emailForSignIn) {
        emailForSignIn = window.prompt('Please provide your email for confirmation');
      }
      if (emailForSignIn) {
        signInWithEmailLink(auth, emailForSignIn, window.location.href)
          .then(() => {
            window.localStorage.removeItem('emailForSignIn');
            window.history.replaceState({}, document.title, window.location.pathname);
          })
          .catch((err) => setError(err.message));
      }
    }

    return () => unsubscribe();
  }, []);

  // --- Data Logic ---
  useEffect(() => {
    if (!user) return;

    const ticketsRef = ref(db, 'tickets');
    const unsubscribe = onValue(ticketsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const ticketList = Object.entries(data).map(([key, val]) => ({
          ...(val as any),
          _key: key
        }));
        // Filter based on user permissions
        const filtered = user.role === 'Admin' || user.role === 'Overwatch' 
          ? ticketList 
          : ticketList.filter(t => {
              const userStores = Array.isArray(user.stores) ? user.stores : [user.stores];
              return userStores.includes(t.storeCode);
            });
        
        setTickets(filtered.sort((a, b) => b.createdAt - a.createdAt));
      } else {
        setTickets([]);
      }
    });

    return () => unsubscribe();
  }, [user]);

  // --- Handlers ---
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    try {
      await sendSignInLinkToEmail(auth, email, {
        url: window.location.origin,
        handleCodeInApp: true,
      });
      window.localStorage.setItem('emailForSignIn', email);
      setLoginSent(true);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleLogout = () => {
    signOut(auth);
    setCurrentScreen('home');
  };

  const submitTicket = async () => {
    if (!selectedStore || !formCategory || !formDescription) {
      alert('Please fill in all required fields');
      return;
    }

    setIsSubmitting(true);
    try {
      const catPrefix = {
        plumbing: 'PLM', equipment: 'EQP', it: 'IT',
        structural: 'STR', safety: 'SAF', other: 'GEN'
      }[formCategory] || 'GEN';

      const now = Date.now();
      const ticketId = `${selectedStore.code}-${catPrefix}-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;

      const newTicket: Ticket = {
        id: ticketId,
        storeCode: selectedStore.code,
        storeName: selectedStore.name,
        brand: selectedStore.brand,
        category: formCategory,
        location: formLocation,
        description: formDescription,
        priority: formPriority,
        status: 'unassigned',
        createdAt: now,
        updatedAt: now,
        createdBy: user?.email || '',
        createdByName: user?.name || '',
        photos: formPhotos
      };

      await set(ref(db, `tickets/${ticketId}`), newTicket);
      
      // Reset form
      setFormCategory('');
      setFormDescription('');
      setFormPriority('routine');
      setFormPhotos([]);
      setCurrentScreen('tickets');
      alert('Ticket submitted successfully!');
    } catch (err: any) {
      alert('Error submitting ticket: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- Render Helpers ---
  if (loading) return <LoadingScreen />;

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white p-8 rounded-3xl shadow-xl shadow-slate-200 w-full max-w-md border border-slate-100"
        >
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-200">
              <Wrench className="text-white w-8 h-8" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-center text-slate-900 mb-2">Dossani Paradise R&M</h1>
          <p className="text-slate-500 text-center mb-8">Repair & Maintenance Tracker</p>

          {!loginSent ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Email Address</label>
                <input 
                  type="email" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@dossaniparadise.com"
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                  required
                />
              </div>
              <button 
                type="submit"
                className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold shadow-lg shadow-blue-200 hover:bg-blue-700 active:scale-95 transition-all"
              >
                Send Sign-In Link
              </button>
              {error && <p className="text-red-500 text-xs text-center mt-2">{error}</p>}
            </form>
          ) : (
            <div className="text-center space-y-4">
              <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-100">
                <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-2" />
                <p className="text-emerald-800 font-semibold">Check your email!</p>
                <p className="text-emerald-600 text-sm">We've sent a secure sign-in link to {email}.</p>
              </div>
              <button 
                onClick={() => setLoginSent(false)}
                className="text-blue-600 font-semibold text-sm hover:underline"
              >
                Try a different email
              </button>
            </div>
          )}
        </motion.div>
      </div>
    );
  }

  return (
    <div className={cn("min-h-screen flex flex-col transition-colors duration-300", isDarkMode ? "bg-slate-900 text-white" : "bg-slate-50 text-slate-900")}>
      {/* Header */}
      <header className={cn("sticky top-0 z-30 px-4 py-3 border-b flex items-center justify-between backdrop-blur-md", isDarkMode ? "bg-slate-900/80 border-slate-800" : "bg-white/80 border-slate-200")}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-md shadow-blue-200/20">
            <Wrench className="text-white w-5 h-5" />
          </div>
          <div>
            <h2 className="font-bold text-sm leading-tight">Dossani R&M</h2>
            <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">{user.role}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setIsDarkMode(!isDarkMode)}
            className={cn("p-2 rounded-full transition-colors", isDarkMode ? "bg-slate-800 text-yellow-400" : "bg-slate-100 text-slate-600")}
          >
            {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <button 
            onClick={handleLogout}
            className={cn("p-2 rounded-full transition-colors", isDarkMode ? "bg-slate-800 text-slate-400" : "bg-slate-100 text-slate-600")}
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 pb-24 max-w-2xl mx-auto w-full px-4 pt-6">
        <AnimatePresence mode="wait">
          {currentScreen === 'home' && (
            <motion.div 
              key="home"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-6"
            >
              <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold">Select Store</h1>
                <button 
                  onClick={() => setShowMap(!showMap)}
                  className="flex items-center gap-2 text-sm font-semibold text-blue-600 bg-blue-50 px-3 py-1.5 rounded-full"
                >
                  {showMap ? <List size={16} /> : <MapIcon size={16} />}
                  {showMap ? 'Show List' : 'View Map'}
                </button>
              </div>

              {showMap ? (
                <div className="h-[400px] w-full rounded-3xl overflow-hidden border border-slate-200 shadow-inner bg-slate-100">
                  <Suspense fallback={<div className="w-full h-full flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>}>
                    <Map 
                      stores={STORES} 
                      onSelectStore={(store) => {
                        setSelectedStore(store);
                        setCurrentScreen('new-ticket');
                      }} 
                    />
                  </Suspense>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input 
                      type="text" 
                      placeholder="Search stores..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className={cn("w-full pl-12 pr-4 py-3 rounded-2xl border focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all", isDarkMode ? "bg-slate-800 border-slate-700" : "bg-white border-slate-200")}
                    />
                  </div>
                  
                  <div className="grid grid-cols-1 gap-3">
                    {STORES.filter(s => s.name.toLowerCase().includes(searchQuery.toLowerCase())).map(store => (
                      <button 
                        key={store.id}
                        onClick={() => {
                          setSelectedStore(store);
                          setCurrentScreen('new-ticket');
                        }}
                        className={cn("p-4 rounded-2xl border text-left flex items-center justify-between group active:scale-[0.98] transition-all", isDarkMode ? "bg-slate-800 border-slate-700 hover:border-blue-500" : "bg-white border-slate-200 hover:border-blue-500 shadow-sm")}
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center overflow-hidden">
                            <img src={`/logos/${store.brand}-logo.png`} alt={store.brand} className="w-8 h-8 object-contain" onError={(e) => { (e.target as any).src = 'https://via.placeholder.com/40?text=' + store.brand.toUpperCase() }} />
                          </div>
                          <div>
                            <h3 className="font-bold">{store.name}</h3>
                            <p className="text-xs text-slate-500">{store.address}</p>
                          </div>
                        </div>
                        <ChevronRight className="text-slate-300 group-hover:text-blue-500 transition-colors" size={20} />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {currentScreen === 'new-ticket' && (
            <motion.div 
              key="new"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="flex items-center gap-4">
                <button onClick={() => setCurrentScreen('home')} className="p-2 rounded-full bg-white border border-slate-200 shadow-sm">
                  <ArrowLeft size={20} />
                </button>
                <h1 className="text-2xl font-bold">New Ticket</h1>
              </div>

              <div className={cn("p-6 rounded-3xl border space-y-6", isDarkMode ? "bg-slate-800 border-slate-700" : "bg-white border-slate-200 shadow-sm")}>
                <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
                  <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
                    <MapIcon className="text-blue-600" size={20} />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Selected Store</p>
                    <p className="font-bold">{selectedStore?.name}</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-bold text-slate-500 mb-2 uppercase tracking-wider">Category</label>
                    <div className="grid grid-cols-3 gap-2">
                      {CATEGORIES.map(cat => (
                        <button 
                          key={cat.id}
                          onClick={() => setFormCategory(cat.id)}
                          className={cn(
                            "flex flex-col items-center justify-center p-3 rounded-2xl border transition-all active:scale-95",
                            formCategory === cat.id 
                              ? "bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-200" 
                              : isDarkMode ? "bg-slate-700 border-slate-600 text-slate-300" : "bg-slate-50 border-slate-100 text-slate-600"
                          )}
                        >
                          <span className="text-xl mb-1">{cat.icon}</span>
                          <span className="text-[10px] font-bold uppercase">{cat.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-slate-500 mb-2 uppercase tracking-wider">Urgency</label>
                    <div className="flex gap-2">
                      {PRIORITIES.map(p => (
                        <button 
                          key={p.id}
                          onClick={() => setFormPriority(p.id as any)}
                          className={cn(
                            "flex-1 py-3 rounded-2xl border flex items-center justify-center gap-2 transition-all active:scale-95",
                            formPriority === p.id 
                              ? `${p.color} text-white border-transparent shadow-lg` 
                              : isDarkMode ? "bg-slate-700 border-slate-600 text-slate-300" : "bg-slate-50 border-slate-100 text-slate-600"
                          )}
                        >
                          <span className="text-sm font-bold">{p.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-slate-500 mb-2 uppercase tracking-wider">Description</label>
                    <textarea 
                      value={formDescription}
                      onChange={(e) => setFormDescription(e.target.value)}
                      placeholder="What needs to be fixed?"
                      className={cn("w-full px-4 py-3 rounded-2xl border focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[120px] transition-all", isDarkMode ? "bg-slate-700 border-slate-600" : "bg-slate-50 border-slate-100")}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-slate-500 mb-2 uppercase tracking-wider">Photos</label>
                    <div className="flex gap-3">
                      <button className={cn("w-20 h-20 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center gap-1 text-slate-400 hover:text-blue-500 hover:border-blue-500 transition-all", isDarkMode ? "border-slate-700" : "border-slate-200")}>
                        <Camera size={24} />
                        <span className="text-[10px] font-bold">ADD</span>
                      </button>
                      {formPhotos.map((p, i) => (
                        <div key={i} className="w-20 h-20 rounded-2xl bg-slate-200 overflow-hidden">
                          <img src={p} alt="Attachment" className="w-full h-full object-cover" />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <button 
                  onClick={submitTicket}
                  disabled={isSubmitting}
                  className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold shadow-xl shadow-blue-200 hover:bg-blue-700 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isSubmitting ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <CheckCircle2 size={20} />}
                  {isSubmitting ? 'Submitting...' : 'Submit Ticket'}
                </button>
              </div>
            </motion.div>
          )}

          {currentScreen === 'tickets' && (
            <motion.div 
              key="list"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold">Active Tickets</h1>
                <div className="flex gap-2">
                  <button className="p-2 rounded-full bg-white border border-slate-200 shadow-sm">
                    <Filter size={18} />
                  </button>
                </div>
              </div>

              {(user.role === 'Admin' || user.role === 'Overwatch') && renderAdminSummary()}

              <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 no-scrollbar">
                {['all', 'unassigned', 'inprogress', 'waiting', 'resolved'].map(status => (
                  <button 
                    key={status}
                    onClick={() => setFilterStatus(status)}
                    className={cn(
                      "px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all border",
                      filterStatus === status 
                        ? "bg-blue-600 border-blue-600 text-white shadow-md" 
                        : isDarkMode ? "bg-slate-800 border-slate-700 text-slate-400" : "bg-white border-slate-200 text-slate-600"
                    )}
                  >
                    {status.toUpperCase()}
                  </button>
                ))}
              </div>

              <div className="space-y-3">
                {tickets
                  .filter(t => filterStatus === 'all' || t.status === filterStatus)
                  .map(ticket => (
                  <motion.div 
                    layout
                    key={ticket.id}
                    className={cn("p-4 rounded-3xl border flex flex-col gap-3 transition-all", isDarkMode ? "bg-slate-800 border-slate-700" : "bg-white border-slate-200 shadow-sm")}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center">
                          <span className="text-lg">{CATEGORIES.find(c => c.id === ticket.category)?.icon || '📎'}</span>
                        </div>
                        <div>
                          <h3 className="font-bold text-sm leading-tight">{ticket.storeName}</h3>
                          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{ticket.id}</p>
                        </div>
                      </div>
                      <Badge status={ticket.status} />
                    </div>
                    
                    <p className="text-sm text-slate-600 line-clamp-2">{ticket.description}</p>
                    
                    <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                      <div className="flex items-center gap-2">
                        <div className={cn("w-2 h-2 rounded-full", PRIORITIES.find(p => p.id === ticket.priority)?.color || 'bg-slate-300')}></div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{ticket.priority}</span>
                      </div>
                      
                      {user.role === 'Technician' && ticket.status !== 'resolved' && ticket.status !== 'closed' && (
                        <div className="flex gap-2">
                          {activeClockIn?.ticketId === ticket.id ? (
                            <button 
                              onClick={(e) => { e.stopPropagation(); handleClockOut(ticket.id); }}
                              className="bg-red-600 text-white text-[10px] font-bold px-3 py-1 rounded-lg shadow-md"
                            >
                              CLOCK OUT
                            </button>
                          ) : (
                            <button 
                              onClick={(e) => { e.stopPropagation(); handleClockIn(ticket); }}
                              disabled={!!activeClockIn}
                              className={cn(
                                "text-white text-[10px] font-bold px-3 py-1 rounded-lg shadow-md transition-all",
                                !!activeClockIn ? "bg-slate-300" : "bg-emerald-600 active:scale-95"
                              )}
                            >
                              CLOCK IN
                            </button>
                          )}
                        </div>
                      )}

                      <div className="flex items-center gap-1.5 text-slate-400">
                        <Clock size={12} />
                        <span className="text-[10px] font-bold">{new Date(ticket.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </motion.div>
                ))}

                {tickets.length === 0 && (
                  <div className="text-center py-12">
                    <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <AlertCircle className="text-slate-300" size={32} />
                    </div>
                    <p className="text-slate-400 font-medium">No tickets found</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {currentScreen === 'admin' && (
            <motion.div 
              key="admin"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="space-y-6"
            >
              <h1 className="text-2xl font-bold">Settings</h1>
              
              <div className="space-y-4">
                <div className={cn("p-6 rounded-3xl border", isDarkMode ? "bg-slate-800 border-slate-700" : "bg-white border-slate-200 shadow-sm")}>
                  <div className="flex items-center gap-4 mb-6">
                    <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center text-blue-600 font-bold text-2xl">
                      {user.name.charAt(0)}
                    </div>
                    <div>
                      <h3 className="font-bold text-lg">{user.name}</h3>
                      <p className="text-slate-500 text-sm">{user.email}</p>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex justify-between py-3 border-b border-slate-100">
                      <span className="text-sm text-slate-500">Role</span>
                      <span className="text-sm font-bold text-blue-600">{user.role}</span>
                    </div>
                    <div className="flex justify-between py-3">
                      <span className="text-sm text-slate-500">Stores</span>
                      <span className="text-sm font-bold">{Array.isArray(user.stores) ? user.stores.length : 'All'}</span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  <button className={cn("p-4 rounded-2xl border flex items-center justify-between group", isDarkMode ? "bg-slate-800 border-slate-700" : "bg-white border-slate-200 shadow-sm")}>
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-purple-50 rounded-lg text-purple-600"><User size={20} /></div>
                      <span className="font-bold text-sm">User Management</span>
                    </div>
                    <ChevronRight size={18} className="text-slate-300" />
                  </button>
                  <button className={cn("p-4 rounded-2xl border flex items-center justify-between group", isDarkMode ? "bg-slate-800 border-slate-700" : "bg-white border-slate-200 shadow-sm")}>
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-amber-50 rounded-lg text-amber-600"><Settings size={20} /></div>
                      <span className="font-bold text-sm">System Config</span>
                    </div>
                    <ChevronRight size={18} className="text-slate-300" />
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Bottom Navigation */}
      <nav className={cn("fixed bottom-0 left-0 right-0 z-40 px-6 py-4 border-t flex items-center justify-between backdrop-blur-lg", isDarkMode ? "bg-slate-900/90 border-slate-800" : "bg-white/90 border-slate-200")}>
        <button 
          onClick={() => setCurrentScreen('home')}
          className={cn("flex flex-col items-center gap-1 transition-all", currentScreen === 'home' ? "text-blue-600" : "text-slate-400")}
        >
          <LayoutDashboard size={22} className={currentScreen === 'home' ? "scale-110" : ""} />
          <span className="text-[10px] font-bold uppercase tracking-widest">Stores</span>
        </button>
        <button 
          onClick={() => setCurrentScreen('tickets')}
          className={cn("flex flex-col items-center gap-1 transition-all", currentScreen === 'tickets' ? "text-blue-600" : "text-slate-400")}
        >
          <List size={22} className={currentScreen === 'tickets' ? "scale-110" : ""} />
          <span className="text-[10px] font-bold uppercase tracking-widest">Tickets</span>
        </button>
        <div className="relative -top-8">
          <button 
            onClick={() => {
              if (selectedStore) setCurrentScreen('new-ticket');
              else setCurrentScreen('home');
            }}
            className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-blue-300 active:scale-90 transition-all"
          >
            <Plus size={32} />
          </button>
        </div>
        <button 
          className="flex flex-col items-center gap-1 text-slate-400 opacity-50 cursor-not-allowed"
        >
          <Clock size={22} />
          <span className="text-[10px] font-bold uppercase tracking-widest">History</span>
        </button>
        <button 
          onClick={() => setCurrentScreen('admin')}
          className={cn("flex flex-col items-center gap-1 transition-all", currentScreen === 'admin' ? "text-blue-600" : "text-slate-400")}
        >
          <Settings size={22} className={currentScreen === 'admin' ? "scale-110" : ""} />
          <span className="text-[10px] font-bold uppercase tracking-widest">Admin</span>
        </button>
      </nav>
    </div>
  );
}
