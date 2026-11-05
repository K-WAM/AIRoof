// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { CompaniesSection } from "./CompaniesSection";
const state=vi.hoisted(() => ({companies:undefined as unknown}));
vi.mock("@/contexts/BootstrapContext",()=>({useBootstrap:()=>({data:{business:{companies:state.companies}},refresh:vi.fn()})}));
vi.mock("@/contexts/AuthContext",()=>({useAuth:()=>({user:{role:"owner"}})}));
beforeEach(()=>{vi.stubGlobal("fetch",vi.fn());});
it.each([undefined,[],[{id:"rdsf"}]])("single-company branding adds no UI or request: %j",companies=>{state.companies=companies;const view=render(<CompaniesSection logos={[]} />);expect(view.container.innerHTML).toBe("");expect(fetch).not.toHaveBeenCalled();});
