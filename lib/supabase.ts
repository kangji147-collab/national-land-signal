// Design Ref: §1-4, §5 — Supabase 서버 전용 연결. 이 파일은 서버 코드(app/api/, lib/)에서만 불러온다.
// 비밀 키(service_role)는 브라우저로 나가면 안 되므로 환경 변수 이름에 NEXT_PUBLIC_ 을 붙이지 않는다.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`환경 변수 ${name} 값이 없어요`); // 값은 절대 메시지에 넣지 않는다
  return v;
}

/**
 * 공개 읽기용(anon) 키로 연결한다. 규칙표·연락처 같은 관리 표를 읽기만 한다. (RLS 가 웹에서는 읽기만 허용)
 * 요청마다 새로 만들어 쓴다. 읽을 때마다 최신 값을 가져와, 관리자가 고친 내용이 바로 반영된다.
 */
export function createAnonClient(): SupabaseClient {
  return createClient(need("SUPABASE_URL"), need("SUPABASE_ANON_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * 서버 비밀 키(service_role)로 연결한다. 사용 횟수 기록처럼 웹에서 접근하면 안 되는 표 전용.
 * 요청마다 새로 만들어 쓴다 (로그인 상태를 저장하지 않음).
 */
export function createServiceClient(): SupabaseClient {
  return createClient(need("SUPABASE_URL"), need("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
