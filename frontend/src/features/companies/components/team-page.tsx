'use client';

import { useTranslations } from 'next-intl';
import { useMe } from '@/features/auth';
import { useActiveCompany } from '../active-company';
import { InvitationsList } from './invitations-list';
import { InviteForm } from './invite-form';
import { MembersList } from './members-list';
import { NeedsCompany } from './needs-company';

export function TeamPage() {
  const t = useTranslations('hr.team');
  const { active, isOwner } = useActiveCompany();
  const { data: me } = useMe();
  if (!active || !me) return <NeedsCompany />;

  return (
    <div className="grid gap-10">
      <div>
        <h1 className="sp-page-title">{t('title')}</h1>
        <p className="mt-2 max-w-prose text-muted">{isOwner ? t('leadOwner') : t('leadHr')}</p>
      </div>
      <MembersList companyId={active.id} isOwner={isOwner} currentUserId={me.id} />
      {isOwner ? (
        <>
          <InviteForm companyId={active.id} />
          <InvitationsList companyId={active.id} />
        </>
      ) : null}
    </div>
  );
}
