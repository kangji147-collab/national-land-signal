// 시험에서도 앱 코드의 "@/lib/..." 경로를 쓸 수 있게 한다. (tsconfig 의 "@/*" 와 같은 뜻)
import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  // trash-can(지울 파일을 옮겨 두는 임시 폴더)에 있는 시험 파일은 실행하지 않는다
  test: { exclude: [...configDefaults.exclude, "trash-can/**"] },
});
