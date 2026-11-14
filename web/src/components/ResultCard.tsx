import { Check, Clock3, HelpCircle, ShieldAlert, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { receiptUrl, type FullResult } from "../api";

const styleByResult = {
  GENUINE: { icon: Check, color: "good" },
  REPORTED_LOST: { icon: X, color: "danger" },
  REVOKED: { icon: ShieldAlert, color: "danger" },
  REPLACED: { icon: ShieldAlert, color: "warning" },
  EXPIRED: { icon: Clock3, color: "warning" },
  NOT_FOUND: { icon: HelpCircle, color: "unknown" },
  INVALID_TOKEN: { icon: HelpCircle, color: "unknown" }
} as const;

export function ResultCard({ result, full = false, onAgain }: {
  result: FullResult;
  full?: boolean;
  onAgain?: () => void;
}) {
  const { t } = useTranslation();
  const style = styleByResult[result.result];
  const Icon = style.icon;
  return (
    <section className={`result-card ${style.color}`} aria-live="polite" aria-atomic="true">
      <div className="result-heading">
        <Icon size={34} aria-hidden="true" />
        <h2>{t(`results.${result.result}`)}</h2>
      </div>
      <p>{t(`meanings.${result.result}`)}</p>
      <dl>
        {result.documentType && <><dt>{t("documentType")}</dt><dd>{result.documentType}</dd></>}
        {result.issuedByName && <><dt>{t("issuedBy")}</dt><dd>{result.issuedByName}</dd></>}
        {result.issueYear && <><dt>{t("issueYear")}</dt><dd>{result.issueYear}</dd></>}
        {result.maskedHolderName && <><dt>{t("holder")}</dt><dd>{result.maskedHolderName}</dd></>}
        {full && result.holderName && <><dt>{t("holder")}</dt><dd>{result.holderName}</dd></>}
        {full && result.maskedNumber && <><dt>{t("documentNumber")}</dt><dd>{result.maskedNumber}</dd></>}
        {full && result.issueDate && <><dt>{t("issueDate")}</dt><dd>{result.issueDate}</dd></>}
        {full && result.expiryDate && <><dt>{t("expiryDate")}</dt><dd>{result.expiryDate}</dd></>}
        {full && result.status && <><dt>{t("status")}</dt><dd>{result.status}</dd></>}
        <dt>{t("checkedAt")}</dt><dd>{new Date(result.checkedAt).toLocaleString()}</dd>
      </dl>
      {onAgain && <button className="button secondary" onClick={onAgain}>{t("verifyAnother")}</button>}
      {full && result.verificationId && (
        <a href={receiptUrl(result.verificationId)} target="_blank" rel="noreferrer">Printable receipt</a>
      )}
    </section>
  );
}
