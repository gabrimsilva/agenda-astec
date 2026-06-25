import { Phone, Mail, User } from "lucide-react";

interface ActivityClientContactProps {
  contactName?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  variant?: "default" | "compact" | "expanded";
  className?: string;
}

export function ActivityClientContact({
  contactName,
  contactPhone,
  contactEmail,
  variant = "default",
  className = "",
}: ActivityClientContactProps) {
  const hasAnyContact = contactName || contactPhone || contactEmail;

  if (!hasAnyContact) {
    return (
      <div className={`text-sm text-muted-foreground ${className}`}>
        Sem informações de contato
      </div>
    );
  }

  if (variant === "compact") {
    return (
      <div className={`flex flex-col gap-1 text-sm ${className}`}>
        {contactName && (
          <div className="flex items-center gap-1.5">
            <User className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-foreground">{contactName}</span>
          </div>
        )}
        {contactPhone && (
          <div className="flex items-center gap-1.5">
            <Phone className="h-3.5 w-3.5 text-muted-foreground" />
            <a
              href={`tel:${contactPhone}`}
              className="text-primary hover:underline"
              onClick={(e) => e.stopPropagation()}
              data-testid="link-contact-phone"
            >
              {contactPhone}
            </a>
          </div>
        )}
        {contactEmail && (
          <div className="flex items-center gap-1.5">
            <Mail className="h-3.5 w-3.5 text-muted-foreground" />
            <a
              href={`mailto:${contactEmail}`}
              className="text-primary hover:underline truncate"
              onClick={(e) => e.stopPropagation()}
              data-testid="link-contact-email"
            >
              {contactEmail}
            </a>
          </div>
        )}
      </div>
    );
  }

  if (variant === "expanded") {
    return (
      <div className={`space-y-2 ${className}`}>
        {contactName && (
          <div className="flex items-start gap-2">
            <User className="h-4 w-4 text-muted-foreground mt-0.5" />
            <div className="flex-1">
              <div className="text-xs text-muted-foreground">Contato</div>
              <div className="text-sm font-medium">{contactName}</div>
            </div>
          </div>
        )}
        {(contactPhone || contactEmail) && (
          <div className="grid grid-cols-2 gap-4">
            {contactPhone && (
              <div className="flex items-start gap-2">
                <Phone className="h-4 w-4 text-muted-foreground mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-muted-foreground">Telefone</div>
                  <a
                    href={`tel:${contactPhone}`}
                    className="text-sm font-medium text-primary hover:underline"
                    onClick={(e) => e.stopPropagation()}
                    data-testid="link-contact-phone"
                  >
                    {contactPhone}
                  </a>
                </div>
              </div>
            )}
            {contactEmail && (
              <div className="flex items-start gap-2">
                <Mail className="h-4 w-4 text-muted-foreground mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-muted-foreground">Email</div>
                  <a
                    href={`mailto:${contactEmail}`}
                    className="text-sm font-medium text-primary hover:underline break-all"
                    onClick={(e) => e.stopPropagation()}
                    data-testid="link-contact-email"
                  >
                    {contactEmail}
                  </a>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {contactName && (
        <div className="flex items-center gap-2">
          <User className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm">{contactName}</span>
        </div>
      )}
      {contactPhone && (
        <div className="flex items-center gap-2">
          <Phone className="h-4 w-4 text-muted-foreground" />
          <a
            href={`tel:${contactPhone}`}
            className="text-sm text-primary hover:underline"
            onClick={(e) => e.stopPropagation()}
            data-testid="link-contact-phone"
          >
            {contactPhone}
          </a>
        </div>
      )}
      {contactEmail && (
        <div className="flex items-center gap-2">
          <Mail className="h-4 w-4 text-muted-foreground" />
          <a
            href={`mailto:${contactEmail}`}
            className="text-sm text-primary hover:underline truncate"
            onClick={(e) => e.stopPropagation()}
            data-testid="link-contact-email"
          >
            {contactEmail}
          </a>
        </div>
      )}
    </div>
  );
}
