// PROTOTYPE - what a signed-in collaborator sees when an Admin reduces or removes
// their access while they have the project page open.
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Situation = "operator" | "reduced" | "removed" | "removed-last";
type Treatment = "page" | "redirect";

export function AccessChange() {
  const [situation, setSituation] = useState<Situation>("operator");
  const [treatment, setTreatment] = useState<Treatment>("redirect");

  return (
    <div className="p-8 grid grid-cols-[20rem_1fr] gap-8">
      <aside className="space-y-3 text-sm">
        <h2 className="font-semibold">Scenario</h2>
        <p className="text-muted-foreground">
          maria@studio.example is an Operator on storefront and has the project page open with a live log stream.
        </p>
        <div className="flex flex-col gap-2">
          <Button size="sm" variant="outline" onClick={() => setSituation("operator")}>
            Reset: Operator
          </Button>
          <Button size="sm" variant="outline" onClick={() => setSituation("reduced")}>
            Admin changes the role to Viewer
          </Button>
          <Button size="sm" variant="outline" onClick={() => setSituation("removed")}>
            Admin removes access (other projects remain)
          </Button>
          <Button size="sm" variant="outline" onClick={() => setSituation("removed-last")}>
            Admin removes access (last project)
          </Button>
        </div>
        <fieldset className="space-y-1 pt-2">
          <legend className="font-medium">On removal</legend>
          <label className="flex gap-2">
            <input type="radio" checked={treatment === "redirect"} onChange={() => setTreatment("redirect")} />
            Go to the dashboard with a notice
          </label>
          <label className="flex gap-2">
            <input type="radio" checked={treatment === "page"} onChange={() => setTreatment("page")} />
            Replace the page with a message
          </label>
        </fieldset>
      </aside>

      <div className="border rounded-lg min-h-[32rem] overflow-hidden">
        {(situation === "operator" || situation === "reduced") && <ProjectPage reduced={situation === "reduced"} />}
        {(situation === "removed" || situation === "removed-last") && treatment === "page" && (
          <div className="p-12 text-center space-y-3">
            <h1 className="text-lg font-semibold">You no longer have access to storefront</h1>
            <p className="text-sm text-muted-foreground">
              An Admin removed your access. The log stream stopped. If this is a mistake, ask an Admin.
            </p>
            <Button variant="outline">Go to the dashboard</Button>
          </div>
        )}
        {(situation === "removed" || situation === "removed-last") && treatment === "redirect" && (
          <DashboardPage last={situation === "removed-last"} />
        )}
      </div>
    </div>
  );
}

function ProjectPage({ reduced }: { reduced: boolean }) {
  return (
    <div className="p-8 space-y-4">
      {reduced && (
        <div className="rounded-md border border-yellow-600/40 bg-yellow-500/10 px-3 py-2 text-sm flex justify-between">
          <span>Your role on storefront changed to Viewer. You can no longer deploy or control services.</span>
          <button className="text-muted-foreground">Dismiss</button>
        </div>
      )}
      <div className="flex items-center gap-4">
        <span className="text-muted-foreground text-sm">&larr; Back</span>
        <h1 className="text-xl font-semibold">storefront</h1>
        <span className="text-xs rounded-full bg-muted px-2 py-0.5">{reduced ? "Viewer" : "Operator"}</span>
      </div>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Services</CardTitle>
          {!reduced && (
            <div className="flex gap-2">
              <Button size="sm">Deploy</Button>
              <Button size="sm" variant="outline">
                Restart
              </Button>
              <Button size="sm" variant="outline">
                Roll back
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm">web - running</p>
          <pre className="bg-black text-green-400 text-xs font-mono p-4 rounded-lg">
            {"GET /cart 200 12ms\nGET /checkout 200 31ms\nPOST /orders 201 88ms"}
          </pre>
          <p className="text-xs text-muted-foreground">
            {reduced ? "The log stream stays connected: Viewers can read logs." : "Live log stream connected."}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function DashboardPage({ last }: { last: boolean }) {
  return (
    <div className="p-8 space-y-4">
      <div className="rounded-md border border-yellow-600/40 bg-yellow-500/10 px-3 py-2 text-sm">
        You no longer have access to storefront.
      </div>
      <h1 className="text-xl font-semibold">Projects</h1>
      {last ? (
        <p className="text-sm text-muted-foreground">
          You don't have access to any projects. Your account stays active; an Admin can invite you to a project.
        </p>
      ) : (
        <Card>
          <CardContent>
            <span className="font-mono text-sm">docs-site</span>{" "}
            <span className="text-xs rounded-full bg-muted px-2 py-0.5">Viewer</span>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
