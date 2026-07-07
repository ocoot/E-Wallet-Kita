import React, { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "../contexts/LanguageContext";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../lib/supabase";
import { useToast } from "../contexts/ToastContext";
import logoUrl from "../assets/images/user_logo_transparent.png";
import { Mail, Lock, User, LogIn, Sparkles, AlertCircle, Eye, EyeOff, X, ArrowRight, Check, TrendingUp, Shield, Bell, Smartphone } from "lucide-react";
import { motion, AnimatePresence, useAnimation } from "motion/react";
import { Modal } from "../components/Modal";
import { audioFeedback } from "../lib/audio";
import { useGsapTextReveal, useGsapImageScale, useGsapScrollFade } from "../hooks/useGsapAnimations";

const FEATURES = [
  { icon: TrendingUp, title: "Real-time Tracking", desc: "Every transaction updates instantly across all your devices with cloud sync.", img: "https://picsum.photos/seed/finance-dashboard/800/600" },
  { icon: Shield, title: "Bank-Grade Security", desc: "End-to-end encryption ensures your financial data stays private and protected.", img: "https://picsum.photos/seed/cyber-security/800/600" },
  { icon: Bell, title: "Smart Bill Reminders", desc: "Never miss a payment with intelligent notifications and recurring bill tracking.", img: "https://picsum.photos/seed/notification/800/600" },
  { icon: Smartphone, title: "Multi-Platform Sync", desc: "Seamlessly switch between web and mobile with real-time data synchronization.", img: "https://picsum.photos/seed/mobile-app/800/600" },
];

const PARTNERS = ["VISA", "Mastercard", "PayPal", "Stripe", "GoPay", "OVO", "DANA", "LinkAja", "Bank Central Asia", "Bank Mandiri"];

const HORIZONTAL_ACCORDIONS = [
  { title: "Track Spending", desc: "Categorize every expense with intelligent auto-tagging and visual analytics.", img: "https://picsum.photos/seed/spending/800/600" },
  { title: "Set Budgets", desc: "Create monthly budgets per category and get alerts before you overspend.", img: "https://picsum.photos/seed/budget/800/600" },
  { title: "Save Gold", desc: "Invest in digital gold savings with real-time price tracking and auto-DCA.", img: "https://picsum.photos/seed/gold/800/600" },
  { title: "Manage Debt", desc: "Track installments and loans with payoff projections and interest calculators.", img: "https://picsum.photos/seed/debt/800/600" },
];

function NavBar({ onOpenAuth }: { onOpenAuth: () => void }) {
  const { t } = useLanguage();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <motion.nav
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 transition-all duration-500 ${
        scrolled ? "glass-pill shadow-2xl shadow-indigo-500/5" : "bg-transparent"
      } rounded-full px-5 py-2.5 md:px-8 md:py-3`}
    >
      <div className="flex items-center justify-between gap-6 md:gap-12">
        <div className="flex items-center gap-2.5">
          <img src={logoUrl} alt="E-Wallet Kita" className="w-7 h-7 md:w-8 md:h-8 object-contain" />
          <span className="font-display font-bold text-sm md:text-base tracking-tight text-white">E-Wallet Kita</span>
        </div>
        <div className="hidden md:flex items-center gap-8 text-sm text-white/60">
          <a href="#features" className="hover:text-white transition-colors">Features</a>
          <a href="#how-it-works" className="hover:text-white transition-colors">How It Works</a>
          <a href="#testimonials" className="hover:text-white transition-colors">Testimonials</a>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onOpenAuth}
            className="px-4 py-1.5 md:px-6 md:py-2 rounded-full text-xs md:text-sm font-semibold bg-white text-slate-900 hover:bg-white/90 transition-all hover:scale-105 active:scale-95 shadow-lg"
          >
            Get Started
          </button>
        </div>
      </div>
    </motion.nav>
  );
}

function HeroSection({ onOpenAuth }: { onOpenAuth: () => void }) {
  const heroRef = useRef<HTMLDivElement>(null);

  return (
    <section ref={heroRef} className="relative min-h-screen flex items-center justify-center overflow-hidden">
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-[url('https://picsum.photos/seed/finance-hero/1920/1080')] bg-cover bg-center scale-110" />
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950/70 via-slate-950/60 to-slate-950" />
        <div className="radial-glow w-[600px] h-[600px] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-indigo-500/15" />
        <div className="radial-glow w-[400px] h-[400px] -bottom-20 right-0 bg-emerald-500/10" />
      </div>
      <div className="relative z-10 text-center px-4 max-w-5xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.3, ease: "easeOut" }}
        >
          <h1
            className="font-display font-bold text-[clamp(2.5rem,5vw,5rem)] leading-[1.1] text-white max-w-5xl mx-auto text-balance"
          >
            Take full control of your{" "}
            <span className="inline-block w-20 h-8 md:w-28 md:h-12 rounded-full align-middle bg-cover bg-center mx-2 -mt-1 ring-2 ring-white/20" style={{backgroundImage: "url('https://picsum.photos/seed/wallet-icon/200/100')"}}></span>
            {" "}finances with clarity
          </h1>
        </motion.div>
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.5, ease: "easeOut" }}
          className="mt-6 text-lg md:text-xl text-white/50 max-w-2xl mx-auto leading-relaxed"
        >
          Track every rupiah, set smart budgets, and achieve your financial goals
          with Indonesia's most intuitive personal finance app.
        </motion.p>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.7, ease: "easeOut" }}
          className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4"
        >
          <button
            onClick={onOpenAuth}
            className="group px-8 py-4 rounded-full text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-500 transition-all hover:scale-105 active:scale-95 shadow-2xl shadow-indigo-600/25 flex items-center gap-2"
          >
            Start Free Today
            <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
          </button>
          <button
            onClick={onOpenAuth}
            className="px-8 py-4 rounded-full text-sm font-semibold border border-white/15 text-white/80 hover:bg-white/5 hover:text-white transition-all hover:scale-105 active:scale-95"
          >
            Sign In
          </button>
        </motion.div>
      </div>
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-slate-950 to-transparent pointer-events-none" />
    </section>
  );
}

function MarqueeSection() {
  const trackRef = useRef<HTMLDivElement>(null);

  return (
    <section className="py-16 md:py-24 overflow-hidden bg-slate-950 relative">
      <div className="absolute inset-0 mesh-gradient opacity-50" />
      <div className="relative z-10">
        <p className="text-center text-xs font-semibold uppercase tracking-[0.2em] text-white/20 mb-8">
          Trusted by thousands across Indonesia
        </p>
        <div className="relative overflow-x-hidden w-full max-w-full">
          <div ref={trackRef} className="infinite-marquee-track flex items-center gap-16 md:gap-24 px-8">
            {[...PARTNERS, ...PARTNERS].map((name, i) => (
              <div key={i} className="flex items-center gap-3 text-white/20 hover:text-white/40 transition-colors duration-500 shrink-0">
                <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-[10px] font-bold tracking-wider">{name.slice(0, 2)}</div>
                <span className="text-sm md:text-base font-semibold tracking-tight whitespace-nowrap">{name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function BentoFeaturesSection() {
  const sectionRef = useRef<HTMLDivElement>(null);

  useGsapScrollFade(sectionRef);

  return (
    <section ref={sectionRef} id="features" className="py-32 md:py-48 px-4 relative">
      <div className="radial-glow w-[500px] h-[500px] top-0 left-0 bg-indigo-500/10" />
      <div className="max-w-6xl mx-auto relative z-10">
        <div className="text-center mb-16 md:mb-24">
          <h2 className="font-display font-bold text-[clamp(2rem,4vw,3.5rem)] text-white">
            Everything you need to{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-emerald-400">master your money</span>
          </h2>
          <p className="mt-4 text-white/40 text-lg max-w-2xl mx-auto">
            Powerful tools designed for the way you actually manage finances.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 auto-rows-auto" style={{ gridAutoFlow: 'dense' }}>
          {FEATURES.map((feat, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.7, delay: i * 0.1, ease: "easeOut" }}
              className={`group relative overflow-hidden rounded-3xl border border-white/5 bg-slate-900/60 backdrop-blur-sm
                ${i === 0 ? 'md:row-span-2' : 'md:row-span-1'}
                ${i === 1 ? 'md:col-span-1' : ''}
                ${i === 2 ? 'md:col-span-1' : ''}
                ${i === 3 ? 'md:col-span-2' : ''}
                hover:border-white/10 transition-all duration-700`}
              style={{ gridAutoFlow: 'dense' }}
            >
              <div className="p-8 md:p-10 h-full flex flex-col">
                <div className="w-12 h-12 rounded-2xl bg-indigo-600/10 border border-indigo-500/20 flex items-center justify-center mb-5 group-hover:scale-110 transition-transform duration-500">
                  <feat.icon size={22} className="text-indigo-400" />
                </div>
                <h3 className="font-display font-semibold text-xl text-white mb-3">{feat.title}</h3>
                <p className="text-white/40 text-sm leading-relaxed flex-1">{feat.desc}</p>
                {i === 0 && (
                  <div className="mt-6 overflow-hidden rounded-2xl">
                    <div className="scale-image w-full h-48 bg-cover bg-center rounded-2xl group-hover:scale-105 transition-transform duration-700 ease-out" style={{backgroundImage: `url(${feat.img})`}} />
                  </div>
                )}
              </div>
              {i === 3 && (
                <div className="absolute bottom-0 right-0 w-1/2 h-full opacity-20">
                  <div className="scale-image w-full h-full bg-cover bg-center" style={{backgroundImage: `url(${feat.img})`}} />
                </div>
              )}
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

function HorizontalAccordionSection() {
  const [activeIndex, setActiveIndex] = useState(1);
  const sectionRef = useRef<HTMLDivElement>(null);
  const textRevealRef = useRef<HTMLDivElement>(null);

  useGsapTextReveal(textRevealRef);

  return (
    <section ref={sectionRef} id="how-it-works" className="py-32 md:py-48 px-4 relative">
      <div className="radial-glow w-[600px] h-[600px] bottom-0 right-0 bg-emerald-500/10" />
      <div className="max-w-6xl mx-auto relative z-10">
        <div ref={textRevealRef} className="text-center mb-16 md:mb-24">
          <h2 className="font-display font-bold text-[clamp(2rem,4vw,3.5rem)] text-white">
            <span className="reveal-word inline-block">How</span>{" "}
            <span className="reveal-word inline-block">it</span>{" "}
            <span className="reveal-word inline-block">works</span>
          </h2>
          <p className="mt-4 text-white/40 text-lg max-w-2xl mx-auto">
            <span className="reveal-word inline-block">Simple</span>{" "}
            <span className="reveal-word inline-block">steps</span>{" "}
            <span className="reveal-word inline-block">to</span>{" "}
            <span className="reveal-word inline-block">financial</span>{" "}
            <span className="reveal-word inline-block">freedom</span>
          </p>
        </div>
        <div className="flex flex-col md:flex-row gap-2 h-[500px] md:h-[600px]">
          {HORIZONTAL_ACCORDIONS.map((item, i) => (
            <button
              key={i}
              onClick={() => setActiveIndex(i)}
              className={`horizontal-accordion-slice relative overflow-hidden rounded-3xl border border-white/5 bg-slate-900/60 backdrop-blur-sm cursor-pointer text-left
                ${activeIndex === i ? 'flex-[3]' : 'flex-[0.6]'}
                md:flex-[var(--flex-val)]
                group`}
              style={{ '--flex-val': activeIndex === i ? '3' : '0.6' } as React.CSSProperties}
            >
              <div
                className="absolute inset-0 bg-cover bg-center transition-all duration-700 ease-out group-hover:scale-105"
                style={{ backgroundImage: `url(${item.img})`, opacity: activeIndex === i ? 0.3 : 0.15 }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-950/20 to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 p-6 md:p-8">
                <h3 className={`font-display font-semibold text-white transition-all duration-500 ${activeIndex === i ? 'text-2xl md:text-3xl mb-3' : 'text-xs md:text-sm [writing-mode:vertical-lr] md:[writing-mode:horizontal-tb] mb-0'}`}>
                  {item.title}
                </h3>
                <p className={`text-white/60 text-sm leading-relaxed transition-all duration-500 ${activeIndex === i ? 'opacity-100 max-h-24' : 'opacity-0 max-h-0 overflow-hidden'}`}>
                  {item.desc}
                </p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function TestimonialSection() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLDivElement>(null);

  useGsapImageScale(imageRef);
  useGsapScrollFade(sectionRef);

  const testimonials = [
    { name: "Ayu Putri", role: "Freelancer", text: "Finally an app that understands Indonesian personal finance. The budget tracking is a game-changer.", avatar: "https://picsum.photos/seed/avatar-woman/200/200" },
    { name: "Bambang Susilo", role: "Small Business Owner", text: "I've tried 5 different finance apps. This one is the first that actually stuck.", avatar: "https://picsum.photos/seed/avatar-man/200/200" },
    { name: "Dewi Lestari", role: "Software Engineer", text: "The gold savings feature helped me start investing with as little as Rp 10,000.", avatar: "https://picsum.photos/seed/avatar-woman2/200/200" },
  ];

  return (
    <section ref={sectionRef} id="testimonials" className="py-32 md:py-48 px-4 relative">
      <div className="radial-glow w-[500px] h-[500px] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-indigo-500/8" />
      <div className="max-w-6xl mx-auto relative z-10">
        <h2 className="font-display font-bold text-[clamp(2rem,4vw,3.5rem)] text-white text-center mb-16">
          Loved by thousands
        </h2>
        <div ref={imageRef} className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {testimonials.map((item, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.6, delay: i * 0.15, ease: "easeOut" }}
              className="p-8 rounded-3xl border border-white/5 bg-slate-900/40 backdrop-blur-sm hover:border-white/10 transition-all duration-500"
            >
              <div className="flex items-center gap-4 mb-5">
                <div className="w-12 h-12 rounded-full overflow-hidden ring-2 ring-white/10 scale-image">
                  <img src={item.avatar} alt={item.name} className="w-full h-full object-cover" />
                </div>
                <div>
                  <p className="font-semibold text-white text-sm">{item.name}</p>
                  <p className="text-white/40 text-xs">{item.role}</p>
                </div>
              </div>
              <p className="text-white/60 text-sm leading-relaxed">&ldquo;{item.text}&rdquo;</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CTASection({ onOpenAuth }: { onOpenAuth: () => void }) {
  const sectionRef = useRef<HTMLDivElement>(null);

  useGsapScrollFade(sectionRef);

  return (
    <section ref={sectionRef} className="py-32 md:py-48 px-4 relative">
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-[url('https://picsum.photos/seed/finance-success/1920/1080')] bg-cover bg-center bg-fixed" />
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950 via-slate-950/85 to-slate-950" />
        <div className="radial-glow w-[700px] h-[700px] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-indigo-500/20" />
      </div>
      <div className="relative z-10 text-center max-w-3xl mx-auto">
        <h2 className="font-display font-bold text-[clamp(2rem,4vw,4rem)] text-white leading-[1.1]">
          Ready to take control of your finances?
        </h2>
        <p className="mt-6 text-lg text-white/50 max-w-xl mx-auto">
          Join thousands of Indonesians who have transformed their relationship with money.
        </p>
        <button
          onClick={onOpenAuth}
          className="group mt-10 px-10 py-5 rounded-full text-base font-semibold bg-indigo-600 text-white hover:bg-indigo-500 transition-all hover:scale-105 active:scale-95 shadow-2xl shadow-indigo-600/30 flex items-center gap-3 mx-auto"
        >
          Get Started Free
          <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
        </button>
        <p className="mt-4 text-white/30 text-sm">No credit card required. Free forever.</p>
      </div>
    </section>
  );
}

function FooterSection({ onOpenAuth }: { onOpenAuth: () => void }) {
  return (
    <footer className="py-16 md:py-24 px-4 border-t border-white/5 relative">
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-16">
          <div className="col-span-2 md:col-span-1">
            <div className="flex items-center gap-2.5 mb-4">
              <img src={logoUrl} alt="E-Wallet Kita" className="w-8 h-8 object-contain" />
              <span className="font-display font-bold text-base text-white">E-Wallet Kita</span>
            </div>
            <p className="text-white/40 text-sm leading-relaxed max-w-xs">
              Indonesia's most intuitive personal finance app. Track, budget, and grow your wealth.
            </p>
          </div>
          <div>
            <h4 className="font-semibold text-white text-sm mb-4">Product</h4>
            <ul className="space-y-2.5">
              {["Features", "Pricing", "Integrations", "Changelog"].map((item) => (
                <li key={item}><a href="#" className="text-white/40 hover:text-white text-sm transition-colors">{item}</a></li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="font-semibold text-white text-sm mb-4">Company</h4>
            <ul className="space-y-2.5">
              {["About", "Blog", "Careers", "Press"].map((item) => (
                <li key={item}><a href="#" className="text-white/40 hover:text-white text-sm transition-colors">{item}</a></li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="font-semibold text-white text-sm mb-4">Support</h4>
            <ul className="space-y-2.5">
              {["Help Center", "Documentation", "API Status", "Contact"].map((item) => (
                <li key={item}><a href="#" className="text-white/40 hover:text-white text-sm transition-colors">{item}</a></li>
              ))}
            </ul>
          </div>
        </div>
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 pt-8 border-t border-white/5">
          <p className="text-white/30 text-xs">
            &copy; {new Date().getFullYear()} E-Wallet Kita App. All Rights Reserved | Budi Hertanto |
            <a href="https://github.com/ocoot" target="_blank" rel="noopener noreferrer" className="hover:text-emerald-400 transition-colors ml-1">Github: @ocoot</a>
          </p>
          <button
            onClick={onOpenAuth}
            className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors font-semibold"
          >
            Sign In to your account
          </button>
        </div>
      </div>
    </footer>
  );
}

function AuthSlideOver({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { t } = useLanguage();
  const { signInWithGoogle, signInAsGuest } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const shakeControls = useAnimation();

  const [isSignUp, setIsSignUp] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean; title: string; description: string; type: "info" | "warning"; onConfirm: () => void }>({
    isOpen: false, title: "", description: "", type: "info", onConfirm: () => {},
  });

  const triggerShake = async () => {
    await shakeControls.start({ x: [-6, 6, -4, 4, 0], transition: { duration: 0.4 } });
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    audioFeedback.playClick();
    if (!email || !email.includes("@")) {
      audioFeedback.playDullPluck(); triggerShake();
      showToast(t("auth.validation_email"), "error"); return;
    }
    if (!password || password.length < 6) {
      audioFeedback.playDullPluck(); triggerShake();
      showToast(t("auth.validation_pass"), "error"); return;
    }
    if (isSignUp && !displayName.trim()) {
      audioFeedback.playDullPluck(); triggerShake();
      showToast(t("auth.toast_blank_name"), "error"); return;
    }
    setConfirmModal({
      isOpen: true,
      title: isSignUp ? t("auth.confirm_signup_title") : t("auth.confirm_login_title"),
      description: isSignUp ? t("auth.confirm_signup_desc", { email }) : t("auth.confirm_login_desc", { email }),
      type: "info",
      onConfirm: async () => {
        audioFeedback.playClick();
        setConfirmModal((p) => ({ ...p, isOpen: false }));
        setIsLoading(true);
        try {
          if (isSignUp) {
            const { error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: displayName } } });
            if (error) throw error;
            showToast(t("toast.welcome_signup"), "success");
          } else {
            const { error } = await supabase.auth.signInWithPassword({ email, password });
            if (error) throw error;
            showToast(t("auth.toast_signin_success"), "success");
            navigate("/dashboard");
          }
        } catch (e: any) {
          audioFeedback.playDullPluck();
          showToast(e.message, "error");
        }
        setIsLoading(false);
      },
    });
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    audioFeedback.playClick();
    if (!email || !email.includes("@")) {
      audioFeedback.playDullPluck(); triggerShake();
      showToast(t("auth.validation_email"), "error"); return;
    }
    setConfirmModal({
      isOpen: true,
      title: t("auth.forgot_password_title"),
      description: t("auth.confirm_forgot_password_desc", { email }),
      type: "info",
      onConfirm: async () => {
        audioFeedback.playClick();
        setConfirmModal((p) => ({ ...p, isOpen: false }));
        setIsLoading(true);
        try {
          const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
          if (error) throw error;
          showToast(t("auth.forgot_password_success"), "success");
          setIsForgotPassword(false);
        } catch (err: any) {
          audioFeedback.playDullPluck();
          showToast(err.message, "error");
        }
        setIsLoading(false);
      },
    });
  };

  const handleGoogleLogin = async () => {
    audioFeedback.playClick();
    setConfirmModal({
      isOpen: true, title: t("auth.confirm_google_title"), description: t("auth.confirm_google_desc"), type: "info",
      onConfirm: async () => {
        audioFeedback.playClick();
        setConfirmModal((p) => ({ ...p, isOpen: false }));
        setIsLoading(true);
        try { await signInWithGoogle(); }
        catch (e: any) { showToast(e.message, "error"); }
        setIsLoading(false);
      },
    });
  };

  const handleGuestLogin = async () => {
    audioFeedback.playClick();
    setConfirmModal({
      isOpen: true, title: t("auth.confirm_guest_title"), description: t("auth.confirm_guest_desc"), type: "warning",
      onConfirm: async () => {
        audioFeedback.playClick();
        setConfirmModal((p) => ({ ...p, isOpen: false }));
        setIsLoading(true);
        try { await signInAsGuest(); audioFeedback.playChime(); showToast(t("toast.welcome_auth"), "success"); navigate("/dashboard"); }
        catch (e: any) { showToast(e.message, "error"); }
        setIsLoading(false);
      },
    });
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 260 }}
            className="fixed right-0 top-0 h-full w-full max-w-md z-[70] bg-slate-950 border-l border-white/5 shadow-2xl overflow-y-auto"
          >
            <div className="p-6 md:p-8">
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-2">
                  <img src={logoUrl} alt="EWK" className="w-7 h-7 object-contain" />
                  <span className="font-display font-bold text-sm text-white">E-Wallet Kita</span>
                </div>
                <button onClick={onClose} className="p-2 rounded-xl hover:bg-white/5 text-white/40 hover:text-white transition-all">
                  <X size={18} />
                </button>
              </div>

              <AnimatePresence mode="wait">
                {isForgotPassword ? (
                  <motion.div key="forgot" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.28 }}>
                    <h2 className="font-display font-bold text-xl text-white mb-1">{t("auth.forgot_password_title")}</h2>
                    <p className="text-sm text-white/40 mb-6">{t("auth.forgot_password_desc")}</p>
                    <motion.div animate={shakeControls}>
                      <form onSubmit={handleForgotPassword} className="space-y-4">
                        <div className="space-y-1.5">
                          <label className="text-xs font-semibold uppercase tracking-widest text-white/30">{t("auth.label_email")}</label>
                          <div className="relative group">
                            <Mail size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30 group-focus-within:text-indigo-400 transition-colors" />
                            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} disabled={isLoading} autoComplete="email"
                              className="w-full pl-10 pr-4 py-3 rounded-xl text-sm bg-slate-900 border border-white/10 text-white placeholder:text-white/20 focus:outline-none focus:border-indigo-500 transition-all"
                              placeholder={t("auth.placeholder_email")} />
                          </div>
                        </div>
                        <button type="submit" disabled={isLoading}
                          className="w-full py-3.5 rounded-xl text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 transition-all disabled:opacity-40 shadow-lg shadow-indigo-600/20">
                          {isLoading ? <span className="w-4 h-4 border-2 border-t-transparent border-white rounded-full animate-spin block mx-auto" /> : t("auth.forgot_password_btn")}
                        </button>
                      </form>
                    </motion.div>
                    <button onClick={() => { audioFeedback.playClick(); setIsForgotPassword(false); }} className="mt-5 text-xs text-indigo-400 hover:text-indigo-300 transition-colors">
                      {t("auth.forgot_password_back")}
                    </button>
                  </motion.div>
                ) : (
                  <motion.div key={isSignUp ? "signup" : "signin"} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.28 }}>
                    <h2 className="font-display font-bold text-xl text-white mb-0.5">{isSignUp ? t("auth.btn_signup") : t("auth.btn_signin")}</h2>
                    <p className="text-sm text-white/40 mb-6">{isSignUp ? t("auth.to_signin") : t("auth.to_signup")}</p>

                    <motion.div animate={shakeControls}>
                      <form onSubmit={handleEmailAuth} className="space-y-3.5">
                        {isSignUp && (
                          <div className="space-y-1.5">
                            <label className="text-xs font-semibold uppercase tracking-widest text-white/30">{t("auth.label_display_name")}</label>
                            <div className="relative group">
                              <User size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30 group-focus-within:text-indigo-400 transition-colors" />
                              <input type="text" required value={displayName} onChange={(e) => setDisplayName(e.target.value)} disabled={isLoading} autoComplete="name"
                                className="w-full pl-10 pr-4 py-3 rounded-xl text-sm bg-slate-900 border border-white/10 text-white placeholder:text-white/20 focus:outline-none focus:border-indigo-500 transition-all"
                                placeholder={t("auth.placeholder_display_name")} />
                            </div>
                          </div>
                        )}
                        <div className="space-y-1.5">
                          <label className="text-xs font-semibold uppercase tracking-widest text-white/30">{t("auth.label_email")}</label>
                          <div className="relative group">
                            <Mail size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30 group-focus-within:text-indigo-400 transition-colors" />
                            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} disabled={isLoading} autoComplete="email"
                              className="w-full pl-10 pr-4 py-3 rounded-xl text-sm bg-slate-900 border border-white/10 text-white placeholder:text-white/20 focus:outline-none focus:border-indigo-500 transition-all"
                              placeholder={t("auth.placeholder_email")} />
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <div className="flex justify-between items-center">
                            <label className="text-xs font-semibold uppercase tracking-widest text-white/30">{t("auth.label_password")}</label>
                            {!isSignUp && (
                              <button type="button" onClick={() => { audioFeedback.playClick(); setIsForgotPassword(true); }} disabled={isLoading}
                                className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors">{t("auth.forgot_password")}</button>
                            )}
                          </div>
                          <div className="relative group">
                            <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30 group-focus-within:text-indigo-400 transition-colors" />
                            <input type={showPassword ? "text" : "password"} required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} disabled={isLoading}
                              autoComplete={isSignUp ? "new-password" : "current-password"}
                              className="w-full pl-10 pr-10 py-3 rounded-xl text-sm bg-slate-900 border border-white/10 text-white placeholder:text-white/20 focus:outline-none focus:border-indigo-500 transition-all"
                              placeholder="\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" />
                            <button type="button" tabIndex={-1} onClick={() => setShowPassword((v) => !v)}
                              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors">
                              {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                            </button>
                          </div>
                        </div>
                        <button type="submit" disabled={isLoading}
                          className="w-full py-3.5 rounded-xl text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 transition-all disabled:opacity-40 shadow-lg shadow-indigo-600/20 flex items-center justify-center gap-2">
                          {isLoading
                            ? <span className="w-4 h-4 border-2 border-t-transparent border-white rounded-full animate-spin" />
                            : <><LogIn size={15} /><span>{isSignUp ? t("auth.btn_signup") : t("auth.btn_signin")}</span></>
                          }
                        </button>
                      </form>
                    </motion.div>

                    <div className="text-center mt-4">
                      <button onClick={() => { audioFeedback.playClick(); setIsSignUp(!isSignUp); }} disabled={isLoading}
                        className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors disabled:opacity-50">
                        {isSignUp ? t("auth.to_signin") : t("auth.to_signup")}
                      </button>
                    </div>

                    <div className="relative my-5 flex items-center">
                      <div className="flex-1 h-px bg-white/5" />
                      <span className="px-3 text-xs font-semibold uppercase tracking-widest text-white/20">{t("auth.or_divider_instant")}</span>
                      <div className="flex-1 h-px bg-white/5" />
                    </div>

                    <div className="space-y-2.5">
                      <button type="button" onClick={handleGoogleLogin} disabled={isLoading}
                        className="w-full py-3 rounded-xl text-sm font-semibold border border-white/10 bg-white/5 hover:bg-white/10 text-white/80 hover:text-white transition-all disabled:opacity-40 flex items-center justify-center gap-2.5">
                        <svg viewBox="0 0 24 24" width="16" height="16" className="shrink-0">
                          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                          <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.08H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.92l2.85-2.22.81-.6z"/>
                          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.08l3.66 2.84c.87-2.6 3.3-4.54 6.16-4.54z"/>
                        </svg>
                        <span>{t("auth.login_google")}</span>
                      </button>
                      <button type="button" onClick={handleGuestLogin} disabled={isLoading}
                        className="w-full py-3 rounded-xl text-sm font-semibold border border-dashed border-indigo-500/30 bg-indigo-500/5 hover:bg-indigo-500/10 text-indigo-400 transition-all disabled:opacity-40 flex items-center justify-center gap-2">
                        <Sparkles size={14} />
                        <span>{t("auth.login_guest")}</span>
                      </button>
                    </div>

                    <div className="mt-5 flex gap-2 p-3 rounded-xl bg-amber-500/5 border border-amber-500/15 text-xs text-white/40 leading-relaxed">
                      <AlertCircle size={13} className="text-amber-400 shrink-0 mt-0.5" />
                      <p>{t("auth.guest_disclaimer")}</p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>

          <Modal
            isOpen={confirmModal.isOpen}
            title={confirmModal.title}
            description={confirmModal.description}
            type={confirmModal.type}
            confirmLabel={t("auth.confirm_continue")}
            cancelLabel={t("common.cancel")}
            onConfirm={confirmModal.onConfirm}
            onCancel={() => { audioFeedback.playClick(); setConfirmModal((p) => ({ ...p, isOpen: false })); }}
            zIndex={90}
          />

          <AnimatePresence>
            {isLoading && (
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/80 backdrop-blur-md">
                <motion.div
                  initial={{ scale: 0.93, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.93, opacity: 0 }}
                  className="flex flex-col items-center text-center p-8 bg-slate-900 border border-white/5 rounded-3xl shadow-2xl max-w-xs w-full">
                  <div className="relative w-14 h-14 flex items-center justify-center mb-4">
                    <div className="absolute inset-0 border-[3px] border-indigo-600/20 rounded-full" />
                    <div className="absolute inset-0 border-[3px] border-t-indigo-500 rounded-full animate-spin" />
                    <img src={logoUrl} alt="" className="w-7 h-7 object-contain animate-pulse" />
                  </div>
                  <h3 className="font-display font-bold text-base text-white mb-1">{t("common.loading")}</h3>
                  <p className="text-xs text-white/40 leading-relaxed">{isSignUp ? t("auth.loading_signup_desc") : t("auth.loading_signin_desc")}</p>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </AnimatePresence>
  );
}

export const Login: React.FC = () => {
  const [authOpen, setAuthOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-950 text-white overflow-x-hidden w-full max-w-full">
      <div className="noise-overlay" />
      <NavBar onOpenAuth={() => setAuthOpen(true)} />
      <HeroSection onOpenAuth={() => setAuthOpen(true)} />
      <MarqueeSection />
      <BentoFeaturesSection />
      <HorizontalAccordionSection />
      <TestimonialSection />
      <CTASection onOpenAuth={() => setAuthOpen(true)} />
      <FooterSection onOpenAuth={() => setAuthOpen(true)} />
      <AuthSlideOver isOpen={authOpen} onClose={() => setAuthOpen(false)} />
    </div>
  );
};
