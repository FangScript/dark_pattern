import { supabase } from '../lib/supabaseClient';
import { getUserRole } from '../lib/auth';
import type { DatasetEntry } from './datasetDB';

const DATASET_BUCKET = 'dph-dataset';

/** Strip huge base64 fields so PostgREST payloads stay reasonable. */
export function slimDatasetEntryForRemote(entry: DatasetEntry): Record<string, unknown> {
  const raw = JSON.parse(JSON.stringify(entry)) as Record<string, unknown>;
  delete raw.screenshot;
  delete raw.dom;
  if (Array.isArray(raw.viewport_screenshots)) {
    raw.viewport_screenshots = raw.viewport_screenshots.map((v) => {
      if (v && typeof v === 'object') {
        const o = v as Record<string, unknown>;
        const { screenshot: _s, ...rest } = o;
        return { ...rest, screenshot_omitted: true };
      }
      return v;
    });
  }
  if (Array.isArray(raw.patterns)) {
    raw.patterns = raw.patterns.map((p) => {
      if (p && typeof p === 'object') {
        const o = p as Record<string, unknown>;
        const { croppedImage: _c, ...rest } = o;
        return rest;
      }
      return p;
    });
  }
  return raw;
}

function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  // Works for `data:image/...;base64,...` and also non-base64 data URLs.
  return fetch(dataUrl).then((r) => r.blob());
}

function isAdminAcceptedEntry(entry: DatasetEntry): boolean {
  if (entry.status !== 'verified') return false;
  const accepted =
    (entry.verified_labels ?? []).some((l) => l && l.verified === true) ||
    (entry.viewport_screenshots ?? []).some((vp) =>
      (vp.patterns ?? []).some((p) => (p as any)?.verified === true),
    );
  return accepted;
}

function keepOnlyAcceptedVerifiedLabels(entry: DatasetEntry): DatasetEntry {
  const acceptedVerified = (entry.verified_labels ?? []).filter((l) => l.verified === true);
  return {
    ...entry,
    // keep the status but strip non-accepted reviews
    verified_labels: acceptedVerified,
    // avoid syncing unverified suggestions
    auto_labels: [],
  };
}

async function ensureAdminAcceptedOrSkip(entry: DatasetEntry): Promise<boolean> {
  // Enforce your policy in the client as well (server RLS still recommended).
  const roleRes = await getUserRole();
  if (!roleRes.success || roleRes.data !== 'admin') {
    return false;
  }
  if (!isAdminAcceptedEntry(entry)) {
    return false;
  }
  return true;
}

async function upsertAssetRow(params: {
  kind: 'entry_thumbnail' | 'viewport_screenshot' | 'pattern_crop' | 'dom_dump';
  bucket: string;
  path: string;
  mime_type?: string;
  byte_size?: number;
  sha256?: string;
}): Promise<string> {
  const { data, error } = await supabase
    .from('dataset_assets')
    .insert({
      kind: params.kind,
      bucket: params.bucket,
      path: params.path,
      mime_type: params.mime_type ?? null,
      byte_size: params.byte_size ?? null,
      sha256: params.sha256 ?? null,
    })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  return (data as { id: string }).id;
}

async function uploadToDatasetBucket(path: string, blob: Blob): Promise<void> {
  const { error } = await supabase.storage.from(DATASET_BUCKET).upload(path, blob, {
    upsert: true,
    contentType: blob.type || 'application/octet-stream',
  });
  if (error) throw new Error(error.message);
}

function cropBasePath(userId: string, entryId: string): string {
  return `users/${userId}/entries/${entryId}`;
}

export async function upsertDatasetEntryRemote(entry: DatasetEntry): Promise<void> {
  const ok = await ensureAdminAcceptedOrSkip(entry);
  if (!ok) return;

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) {
    throw new Error(userErr?.message ?? 'Sign in to sync dataset to the cloud.');
  }

  const cleaned = keepOnlyAcceptedVerifiedLabels(entry);

  // 1) Upsert entry row
  {
    const { error } = await supabase.from('dataset_entries').upsert(
      {
        id: cleaned.id,
        url: cleaned.url,
        timestamp_ms: cleaned.timestamp,
        status: cleaned.status,
        page_title: cleaned.metadata?.pageTitle ?? null,
        user_agent: cleaned.metadata?.userAgent ?? null,
        metadata: cleaned.metadata ?? {},
        summary: cleaned.summary ?? {},
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' },
    );
    if (error) throw new Error(error.message);
  }

  // 2) Upload entry thumbnail (optional)
  if (cleaned.screenshot) {
    const blob = await dataUrlToBlob(cleaned.screenshot);
    const path = `${cropBasePath(user.id, cleaned.id)}/thumbnail.png`;
    await uploadToDatasetBucket(path, blob);
    const assetId = await upsertAssetRow({
      kind: 'entry_thumbnail',
      bucket: DATASET_BUCKET,
      path,
      mime_type: blob.type,
      byte_size: blob.size,
    });
    // no dedicated column on entry; store in metadata
    const nextMeta = { ...(cleaned.metadata ?? {}), thumbnail_asset_id: assetId };
    const { error } = await supabase
      .from('dataset_entries')
      .update({ metadata: nextMeta, updated_at: new Date().toISOString() })
      .eq('id', cleaned.id);
    if (error) throw new Error(error.message);
  }

  // 3) Viewport screenshots
  if (cleaned.viewport_screenshots?.length) {
    for (let i = 0; i < cleaned.viewport_screenshots.length; i++) {
      const vp = cleaned.viewport_screenshots[i]!;
      const blob = await dataUrlToBlob(vp.screenshot);
      const path = `${cropBasePath(user.id, cleaned.id)}/viewports/${String(i).padStart(3, '0')}.png`;
      await uploadToDatasetBucket(path, blob);
      const assetId = await upsertAssetRow({
        kind: 'viewport_screenshot',
        bucket: DATASET_BUCKET,
        path,
        mime_type: blob.type,
        byte_size: blob.size,
      });

      const { error } = await supabase.from('dataset_viewports').upsert(
        {
          entry_id: cleaned.id,
          viewport_index: i,
          scroll_y: vp.scrollY,
          viewport_width: vp.viewportWidth,
          viewport_height: vp.viewportHeight,
          device_pixel_ratio: vp.devicePixelRatio ?? 1,
          step_label: vp.stepLabel ?? null,
          phase: vp.phase,
          screenshot_asset_id: assetId,
        },
        { onConflict: 'entry_id,viewport_index' },
      );
      if (error) throw new Error(error.message);
    }
  }

  // 4) Accepted verified labels
  if (cleaned.verified_labels?.length) {
    for (const v of cleaned.verified_labels) {
      const region = { x: v.bbox[0], y: v.bbox[1], width: v.bbox[2], height: v.bbox[3] };
      const { error } = await supabase.from('dataset_labels').insert({
        entry_id: cleaned.id,
        viewport_index: v.viewportIndex ?? null,
        source: 'verified',
        accepted: true,
        category: v.category,
        severity: null,
        confidence: 1,
        bbox_xywh: region,
        bbox_source: null,
        model: null,
        location: v.location ?? null,
        description: v.description ?? null,
        evidence: v.evidence ?? null,
        notes: v.notes ?? null,
      });
      if (error) throw new Error(error.message);
    }
  }
}

export function isDatasetCloudSyncEnabled(): boolean {
  const v =
    (typeof process !== 'undefined' &&
      (process.env.REACT_APP_ENABLE_DATASET_CLOUD_SYNC as string | undefined)) ||
    '';
  return v === '1' || v.toLowerCase() === 'true';
}
