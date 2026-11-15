import { useState, type FormEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  FolderOpen,
  Languages,
  LockKeyhole,
  ScanLine,
  ShieldCheck,
  UserRound,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { AppSettings, Language } from "../lib/types";
import { translate } from "../lib/i18n";
import { cn } from "../lib/ui";
import { Button } from "../components/Button";
import { Logo } from "../components/Logo";
import { Toggle } from "../components/Toggle";

export function OnboardingPage({
  initialSettings,
  onComplete,
}: {
  initialSettings: AppSettings;
  onComplete: (
    nickname: string,
    language: Language,
    realtimeEnabled: boolean,
  ) => Promise<boolean>;
}) {
  const [step, setStep] = useState(0);
  const [language, setLanguage] = useState<Language>(
    initialSettings.language === "en" ? "en" : "tr",
  );
  const [nickname, setNickname] = useState(initialSettings.nickname);
  const [realtime, setRealtime] = useState(initialSettings.realtimeEnabled);
  const [nicknameError, setNicknameError] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const t = (key: Parameters<typeof translate>[1], vars?: Parameters<typeof translate>[2]) =>
    translate(language, key, vars);

  const stepLabels = [
    t("onboarding.stepLanguage"),
    t("onboarding.stepProfile"),
    t("onboarding.stepProtection"),
  ];

  const validate = (): boolean => {
    if (step === 1 && nickname.trim().length === 0) {
      setNicknameError(true);
      return false;
    }
    return true;
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    if (!validate()) return;
    if (step < 2) {
      setStep((current) => current + 1);
      return;
    }
    setSubmitting(true);
    const completed = await onComplete(nickname.trim(), language, realtime);
    if (!completed) setSubmitting(false);
  };

  const handleBack = () => {
    if (step > 0) setStep((current) => current - 1);
  };

  return (
    <div className="flex h-screen overflow-hidden bg-canvas text-fg">
      <aside className="relative hidden w-[46%] shrink-0 flex-col overflow-hidden border-r border-stroke bg-panel p-9 lg:flex">
        <div className="grid-fade pointer-events-none absolute inset-0 opacity-60" />
        <div className="pointer-events-none absolute -left-24 top-24 h-72 w-72 rounded-full bg-brand/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 right-0 h-80 w-80 rounded-full bg-info/10 blur-3xl" />
        <Logo
          size={340}
          className="pointer-events-none absolute -bottom-24 -right-20 opacity-[0.035]"
        />

        <div className="relative flex items-center gap-3">
          <Logo size={38} />
          <div>
            <div className="text-[15px] font-bold tracking-tight">FSODefender</div>
            <div className="text-[10.5px] font-medium text-muted">
              {t("common.appTagline")}
            </div>
          </div>
        </div>

        <div className="relative my-auto max-w-[430px] py-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-brand/20 bg-brand-soft px-3 py-1 text-[10.5px] font-semibold text-brand">
            <span className="h-1.5 w-1.5 rounded-full bg-brand" />
            {t("onboarding.welcomeEyebrow")}
          </div>
          <h1 className="mt-4 text-[34px] font-bold leading-[1.15] tracking-tight">
            {t("onboarding.welcomeTitle")}
          </h1>
          <p className="mt-4 max-w-sm text-[13px] leading-relaxed text-muted">
            {t("onboarding.welcomeDesc")}
          </p>

          <div className="mt-9 space-y-5">
            <Feature
              icon={ScanLine}
              title={t("onboarding.feature1Title")}
              description={t("onboarding.feature1Desc")}
            />
            <Feature
              icon={LockKeyhole}
              title={t("onboarding.feature2Title")}
              description={t("onboarding.feature2Desc")}
            />
            <Feature
              icon={ShieldCheck}
              title={t("onboarding.feature3Title")}
              description={t("onboarding.feature3Desc")}
            />
          </div>
        </div>

        <div className="relative flex items-center gap-2 text-[10.5px] text-faint">
          <LockKeyhole className="h-3.5 w-3.5" />
          {t("onboarding.privacyFootnote")}
        </div>
      </aside>

      <main className="relative flex flex-1 items-center justify-center overflow-y-auto p-6 lg:p-10">
        <div className="w-full max-w-[480px]">
          <div className="mb-5 flex items-center gap-3 lg:hidden">
            <Logo size={32} />
            <div className="text-[14px] font-bold">FSODefender</div>
          </div>

          <div className="mb-5 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex gap-1.5">
                {stepLabels.map((_, index) => (
                  <span
                    key={index}
                    className={cn(
                      "h-1.5 rounded-full transition-all duration-300",
                      index === step
                        ? "w-7 bg-brand"
                        : index < step
                          ? "w-7 bg-brand/50"
                          : "w-7 bg-stroke",
                    )}
                  />
                ))}
              </div>
              <span className="text-[11px] font-semibold text-muted">
                {stepLabels[step]}
              </span>
            </div>
            <span className="text-[10.5px] font-medium text-faint">
              {t("onboarding.stepOf", { current: step + 1, total: 3 })}
            </span>
          </div>

          <form
            onSubmit={(event) => void handleSubmit(event)}
            className="card p-6 sm:p-7"
          >
            <div key={step} className="animate-fade-up">
              {step === 0 && (
                <>
                  <div className="flex items-center gap-3">
                    <StepIcon icon={Languages} />
                    <div>
                      <h2 className="text-[17px] font-bold tracking-tight">
                        {t("onboarding.chooseLanguageTitle")}
                      </h2>
                      <p className="mt-0.5 text-[11.5px] text-muted">
                        {t("onboarding.chooseLanguageDesc")}
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-2.5 sm:grid-cols-2">
                    <LanguageCard
                      code="tr"
                      label="Türkçe"
                      selected={language === "tr"}
                      onClick={() => setLanguage("tr")}
                    />
                    <LanguageCard
                      code="en"
                      label="English"
                      selected={language === "en"}
                      onClick={() => setLanguage("en")}
                    />
                  </div>

                  <div className="mt-5 flex items-start gap-2.5 rounded-xl border border-stroke bg-panel-2 px-3.5 py-3">
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                    <p className="text-[10.5px] leading-relaxed text-muted">
                      {t("onboarding.welcomeDesc")}
                    </p>
                  </div>
                </>
              )}

              {step === 1 && (
                <>
                  <div className="flex items-center gap-3">
                    <StepIcon icon={UserRound} />
                    <div>
                      <h2 className="text-[17px] font-bold tracking-tight">
                        {t("onboarding.profileTitle")}
                      </h2>
                      <p className="mt-0.5 text-[11.5px] text-muted">
                        {t("onboarding.profileDesc")}
                      </p>
                    </div>
                  </div>

                  <div className="mt-6">
                    <label className="label" htmlFor="onboarding-nickname">
                      {t("onboarding.nicknameLabel")}
                    </label>
                    <input
                      id="onboarding-nickname"
                      value={nickname}
                      maxLength={40}
                      autoFocus
                      onChange={(event) => {
                        setNickname(event.target.value);
                        setNicknameError(false);
                      }}
                      placeholder={t("onboarding.nicknamePlaceholder")}
                      className={cn(
                        "input h-11",
                        nicknameError && "border-danger/60",
                      )}
                    />
                    {nicknameError && (
                      <p className="mt-1.5 text-[11px] font-medium text-danger">
                        {t("onboarding.nicknameRequired")}
                      </p>
                    )}
                  </div>

                  <div className="mt-5 flex items-start gap-2.5 rounded-xl border border-stroke bg-panel-2 px-3.5 py-3">
                    <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                    <p className="text-[10.5px] leading-relaxed text-muted">
                      {t("settings.nicknameHint")}
                    </p>
                  </div>
                </>
              )}

              {step === 2 && (
                <>
                  <div className="flex items-center gap-3">
                    <StepIcon icon={ShieldCheck} />
                    <div>
                      <h2 className="text-[17px] font-bold tracking-tight">
                        {t("onboarding.protectionTitle")}
                      </h2>
                      <p className="mt-0.5 text-[11.5px] text-muted">
                        {t("onboarding.protectionDesc")}
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 flex items-center justify-between gap-4 rounded-xl border border-stroke bg-panel-2 p-4">
                    <div className="flex items-start gap-3">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-brand/20 bg-brand-soft text-brand">
                        <Zap className="h-4 w-4" />
                      </span>
                      <div>
                        <div className="text-[12px] font-semibold">
                          {t("onboarding.realtimeLabel")}
                        </div>
                        <p className="mt-0.5 text-[10.5px] leading-relaxed text-muted">
                          {t("onboarding.realtimeDesc")}
                        </p>
                      </div>
                    </div>
                    <Toggle
                      checked={realtime}
                      onChange={setRealtime}
                      label={t("onboarding.realtimeLabel")}
                    />
                  </div>

                  <div className="mt-4">
                    <div className="label">{t("onboarding.watchedTitle")}</div>
                    <div className="space-y-1.5">
                      {initialSettings.watchedDirs.slice(0, 4).map((path) => (
                        <div
                          key={path}
                          className="flex items-center gap-2.5 rounded-lg border border-stroke bg-panel-2 px-3 py-2"
                        >
                          <FolderOpen className="h-3.5 w-3.5 shrink-0 text-muted" />
                          <span
                            className="min-w-0 truncate font-mono text-[10.5px] text-muted"
                            title={path}
                          >
                            {path}
                          </span>
                        </div>
                      ))}
                    </div>
                    <p className="hint mt-2">{t("onboarding.watchedEditHint")}</p>
                  </div>

                  <div className="mt-4 grid gap-1.5">
                    {[
                      t("onboarding.feature1Desc"),
                      t("onboarding.feature2Desc"),
                      t("onboarding.feature3Desc"),
                    ].map((line) => (
                      <div
                        key={line}
                        className="flex items-start gap-2 text-[10.5px] leading-relaxed text-muted"
                      >
                        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
                        {line}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            <div className="mt-6 flex items-center justify-between gap-3 border-t border-stroke pt-5">
              {step > 0 ? (
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<ArrowLeft className="h-3.5 w-3.5" />}
                  onClick={handleBack}
                  disabled={submitting}
                >
                  {t("common.back")}
                </Button>
              ) : (
                <span />
              )}

              <Button
                type="submit"
                variant="primary"
                loading={submitting}
                icon={
                  step === 2 ? (
                    <ShieldCheck className="h-4 w-4" />
                  ) : (
                    <ArrowRight className="h-4 w-4" />
                  )
                }
              >
                {step === 2
                  ? submitting
                    ? t("onboarding.completing")
                    : t("onboarding.startProtection")
                  : t("common.next")}
              </Button>
            </div>
          </form>

          <p className="mt-4 text-center text-[10px] text-faint">
            {t("onboarding.privacyFootnote")}
          </p>
        </div>
      </main>
    </div>
  );
}

function StepIcon({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-brand/25 bg-brand-soft text-brand">
      <Icon className="h-5 w-5" />
    </span>
  );
}

function Feature({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-stroke bg-panel-2 text-brand">
        <Icon className="h-4 w-4" />
      </span>
      <div>
        <div className="text-[12px] font-semibold">{title}</div>
        <div className="mt-0.5 text-[11px] leading-relaxed text-muted">
          {description}
        </div>
      </div>
    </div>
  );
}

function LanguageCard({
  code,
  label,
  selected,
  onClick,
}: {
  code: Language;
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 rounded-xl border px-4 py-3.5 text-left transition-colors",
        selected
          ? "border-brand/50 bg-brand-soft/30 ring-1 ring-brand/20"
          : "border-stroke bg-panel-2 hover:border-stroke-strong",
      )}
    >
      <span className="grid h-10 w-10 place-items-center rounded-lg border border-stroke bg-panel text-[11px] font-bold text-muted">
        {code.toUpperCase()}
      </span>
      <span className="flex-1 text-[13px] font-semibold">{label}</span>
      {selected && <CheckCircle2 className="h-4 w-4 text-brand" />}
    </button>
  );
}
