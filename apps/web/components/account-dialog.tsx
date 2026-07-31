'use client';

import { Crown, LoaderCircle, LogOut, ShieldCheck, UserRound, X } from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';

export interface AccountUser {
  id: string;
  email: string;
  plan: 'free' | 'pro';
  createdAt: string;
}

export function AccountDialog({
  user,
  onUserChange,
  onClose,
}: {
  user: AccountUser | null;
  onUserChange: (user: AccountUser | null) => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [billingConfigured, setBillingConfigured] = useState(false);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [onClose]);

  useEffect(() => {
    void fetch(`${API_BASE_URL}/billing/status`, { credentials: 'include' })
      .then((response) => response.json())
      .then((payload: { configured?: boolean }) =>
        setBillingConfigured(Boolean(payload.configured)),
      )
      .catch(() => setBillingConfigured(false));
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE_URL}/auth/${mode}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const payload = (await response.json()) as { user?: AccountUser; message?: string };
      if (!response.ok || !payload.user) throw new Error(payload.message ?? '操作失败');
      onUserChange(payload.user);
      setPassword('');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '无法连接账号服务');
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    setBusy(true);
    await fetch(`${API_BASE_URL}/auth/logout`, { method: 'POST', credentials: 'include' }).catch(
      () => undefined,
    );
    onUserChange(null);
    setBusy(false);
  }

  async function upgrade() {
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE_URL}/billing/checkout`, {
        method: 'POST',
        credentials: 'include',
      });
      const payload = (await response.json()) as { url?: string; message?: string };
      if (!response.ok || !payload.url) throw new Error(payload.message ?? '无法创建付款页面');
      window.location.assign(payload.url);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '无法连接支付服务');
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/55 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="ClipFlow 账号"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-xl bg-white p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold tracking-[-0.025em]">
              {user ? '我的账号' : '登录 ClipFlow'}
            </h2>
            <p className="mt-1 text-sm leading-6 text-[var(--muted)]">
              {user ? '管理账号与商业版订阅。' : '登录后可管理你的商业版订阅。'}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="关闭账号窗口"
          >
            <X size={19} />
          </Button>
        </div>

        {user ? (
          <div className="mt-6">
            <div className="flex items-center gap-3 border-y border-[var(--line)] py-4">
              <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-[var(--surface-strong)]">
                <UserRound size={19} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{user.email}</p>
                <p className="mt-0.5 text-xs text-[var(--muted)]">
                  {user.plan === 'pro' ? '商业版账号' : '免费版账号'}
                </p>
              </div>
              <span
                className={cn(
                  'rounded-full px-2.5 py-1 text-xs font-semibold',
                  user.plan === 'pro'
                    ? 'bg-[var(--primary-soft)] text-[var(--primary-ink)]'
                    : 'bg-[var(--surface)] text-[var(--muted)]',
                )}
              >
                {user.plan === 'pro' ? 'PRO' : 'FREE'}
              </span>
            </div>

            {user.plan === 'free' ? (
              <div className="mt-5 rounded-xl bg-[var(--primary-soft)] p-4">
                <div className="flex items-center gap-2 font-semibold text-[var(--primary-ink)]">
                  <Crown size={18} /> 升级商业版
                </div>
                <p className="mt-2 text-sm leading-6 text-[var(--primary-ink)]">
                  为团队协作、更多 AI 搜索能力和后续商业功能预留完整账号权益。
                </p>
                <Button
                  className="mt-4 w-full"
                  onClick={upgrade}
                  disabled={busy || !billingConfigured}
                >
                  {busy && <LoaderCircle className="animate-spin" size={17} />}
                  {billingConfigured ? '前往安全付款' : '支付尚未配置'}
                </Button>
                {!billingConfigured && (
                  <p className="mt-2 text-xs leading-5 text-[var(--primary-ink)]">
                    当前不影响免费版使用，配置 Stripe 后即可启用。
                  </p>
                )}
              </div>
            ) : (
              <div className="mt-5 flex items-start gap-3 rounded-xl bg-[var(--success-soft)] p-4 text-[var(--success)]">
                <ShieldCheck className="mt-0.5 shrink-0" size={18} />
                <div>
                  <p className="font-semibold">商业版已生效</p>
                  <p className="mt-1 text-sm leading-6">你的账号已经完成订阅验证。</p>
                </div>
              </div>
            )}

            {error && (
              <p className="mt-4 text-sm text-[var(--error)]" role="alert">
                {error}
              </p>
            )}
            <Button className="mt-5 w-full" variant="ghost" onClick={logout} disabled={busy}>
              <LogOut size={17} /> 退出登录
            </Button>
          </div>
        ) : (
          <>
            <div
              className="mt-6 flex border-b border-[var(--line)]"
              role="tablist"
              aria-label="账号操作"
            >
              {(['login', 'register'] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  role="tab"
                  aria-selected={mode === item}
                  className={cn(
                    'flex-1 border-b-2 px-3 py-2.5 text-sm font-semibold focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[var(--focus)]',
                    mode === item
                      ? 'border-[var(--primary)] text-[var(--primary-ink)]'
                      : 'border-transparent text-[var(--muted)]',
                  )}
                  onClick={() => {
                    setMode(item);
                    setError('');
                  }}
                >
                  {item === 'login' ? '登录' : '注册'}
                </button>
              ))}
            </div>
            <form className="mt-5 space-y-4" onSubmit={submit}>
              <label className="block text-sm font-semibold">
                邮箱
                <Input
                  className="mt-2 border border-[var(--line)]"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </label>
              <label className="block text-sm font-semibold">
                密码
                <Input
                  className="mt-2 border border-[var(--line)]"
                  type="password"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  minLength={8}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              </label>
              {error && (
                <p className="text-sm text-[var(--error)]" role="alert">
                  {error}
                </p>
              )}
              <Button className="w-full" size="lg" type="submit" disabled={busy}>
                {busy && <LoaderCircle className="animate-spin" size={18} />}
                {mode === 'login' ? '登录' : '创建账号'}
              </Button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
