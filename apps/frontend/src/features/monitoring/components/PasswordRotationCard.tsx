import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { queuePasswordRotation } from "@/features/monitoring/api/monitoring.api";
import { QUERY_KEYS } from "@/lib/constants";

const CONFIRM_PHRASE = "ROTATE";

export function PasswordRotationCard(): JSX.Element {
  const queryClient = useQueryClient();
  const feedbackTimeoutRef = useRef<number | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [reason, setReason] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (feedbackTimeoutRef.current !== null) {
        window.clearTimeout(feedbackTimeoutRef.current);
      }
    };
  }, []);

  function scheduleFeedbackClear() {
    if (feedbackTimeoutRef.current !== null) {
      window.clearTimeout(feedbackTimeoutRef.current);
    }

    feedbackTimeoutRef.current = window.setTimeout(() => {
      setFeedback(null);
      feedbackTimeoutRef.current = null;
    }, 5000);
  }

  const mutation = useMutation({
    mutationFn: queuePasswordRotation,
    onSuccess: async ({ job }) => {
      setFeedback(`Password rotation job #${job.id} queued successfully.`);
      setConfirmation("");
      setReason("");
      setIsOpen(false);
      await queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.jobs] });
      scheduleFeedbackClear();
    },
    onError: () => {
      setFeedback("Unable to queue password rotation right now. Please try again.");
      scheduleFeedbackClear();
    },
  });

  const isPhraseValid = confirmation.trim().toUpperCase() === CONFIRM_PHRASE;

  return (
    <article className="rounded-2xl border border-primary/10 bg-surface p-6 shadow-sm">
      <h3 className="font-heading text-xl text-primary">Credential rotation guardrails</h3>
      <p className="mt-2 text-sm text-text">
        Queue password rotation through Orbit jobs with a two-step confirmation.
      </p>
      <Button className="mt-4" onClick={() => setIsOpen(true)}>
        Queue password rotation
      </Button>
      {feedback ? (
        <div className="mt-3 flex items-center gap-2 text-sm text-muted">
          <p>{feedback}</p>
          <Button variant="ghost" size="sm" onClick={() => setFeedback(null)}>
            Dismiss
          </Button>
        </div>
      ) : null}

      <Modal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title="Confirm password rotation"
        footer={
          <>
            <Button variant="ghost" onClick={() => setIsOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => mutation.mutate({ reason: reason.trim() || "Operator initiated rotation" })}
              disabled={!isPhraseValid || mutation.isPending}
            >
              {mutation.isPending ? "Queuing…" : "Confirm and queue"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-text">
            This action schedules a high-risk operation. Type <strong>{CONFIRM_PHRASE}</strong> to continue.
          </p>
          <Input
            name="confirm_phrase"
            label={`Type ${CONFIRM_PHRASE} to confirm`}
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
          />
          <Input
            name="change_reason"
            label="Change reason"
            placeholder="Routine quarterly credential rotation"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </div>
      </Modal>
    </article>
  );
}
