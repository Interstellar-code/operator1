import {
  getAllOpenClawPages,
  getOpenClawDocPage,
  openclawDocsPageTree,
} from "@/lib/docs-openclaw-content";
import { DocsPage } from "./docs";

const openclawSource = {
  allPages: getAllOpenClawPages(),
  pageTree: openclawDocsPageTree,
  getPage: getOpenClawDocPage,
  baseRoute: "/openclaw-docs",
};

export function OpenClawDocsPage() {
  return <DocsPage source={openclawSource} />;
}
