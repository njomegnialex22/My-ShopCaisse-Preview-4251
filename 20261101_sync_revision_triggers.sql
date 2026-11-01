-- My ShopCaisse 4.2.5.1 — migration additive pour la file de synchronisation.
-- À exécuter une seule fois si le schéma principal a déjà été appliqué.
-- Ne supprime aucune donnée.

create or replace function public.myshop_touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.myshop_sync_revision()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  if tg_op = 'UPDATE' then
    new.revision = old.revision + 1;
  else
    new.revision = greatest(coalesce(new.revision, 1), 1);
  end if;
  return new;
end;
$$;

drop trigger if exists myshop_sync_revision_trg on public.shop_sync_records;
create trigger myshop_sync_revision_trg
before insert or update on public.shop_sync_records
for each row execute function public.myshop_sync_revision();

drop trigger if exists myshop_shops_updated_at_trg on public.shops;
create trigger myshop_shops_updated_at_trg
before update on public.shops
for each row execute function public.myshop_touch_updated_at();

drop trigger if exists myshop_roles_updated_at_trg on public.shop_roles;
create trigger myshop_roles_updated_at_trg
before update on public.shop_roles
for each row execute function public.myshop_touch_updated_at();

drop trigger if exists myshop_permissions_updated_at_trg on public.shop_role_permissions;
create trigger myshop_permissions_updated_at_trg
before update on public.shop_role_permissions
for each row execute function public.myshop_touch_updated_at();

create index if not exists shop_sync_records_shop_type_updated_idx
on public.shop_sync_records(shop_id, entity_type, updated_at, id);
