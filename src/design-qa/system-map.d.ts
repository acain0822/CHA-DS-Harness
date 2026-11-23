declare module 'virtual:system-map' {
  export interface ChainLink { token: string; figma?: string | null; when?: string | null; value?: string | null; via?: string[]; missing?: boolean; runtime?: boolean }
  export interface Row { part: string; prop: string; value: string; origin: 'base' | 'variant' | 'state'; rule: string; where: string; replaces: string | null; chain: ChainLink[]; raw: boolean }
  export interface CodeUse { product: string; scanned: string; version: string | null; uses: number; tests: number; files: number; restyled: number; byClass: number; cssRules: number; wrapped: number; props: Record<string, Record<string, number>> }
  export interface ComponentMap {
    name: string; label: string; internal: boolean; figmaUrl: string | null; codePath: string; status: string; notes: string[];
    dims: { prop: string; values: string[] }[]; states: string[]; uses: string[]; usedBy: string[];
    views: { variant: Record<string, string>; state: string; rows: Row[] }[];
    usage: { live: { pages: number; of: number; content: number; chrome: number; modal: number } | null; figma: string | null; code: CodeUse[] | null };
    issues: { id: string; message: string }[];
  }
  const map: {
    components: ComponentMap[];
    tokens: { name: string; figma: string | null; values: { value: string; when: string | null }[]; usedBy: string[] }[];
    sameValue: { value: string; names: string[] }[];
    figmaLinksRecorded: boolean;
    notBuilt: { name: string; category: string; live: { status: string; pages: number } | null }[];
    newest: string;
    products: { name: string; scanned: string; version: string | null; notes: string[]; tokensUsed: number; overridden: string[] }[];
    livePages: number;
  };
  export default map;
}
