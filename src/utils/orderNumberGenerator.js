// Single source of truth for generating a new order number (DO-####),
// backed by the atomic public.lto_order_number_seq sequence via the
// public.lto_get_next_order_number() RPC.
//
// This REPLACES a fallback that used to live duplicated in both
// EnquiryTrackerForm.jsx and EnquiryTracker.jsx: whenever the RPC call
// failed for any reason (a transient network blip, a cold Supabase
// connection, anything), that fallback computed `MAX(order_no) + 1` from
// only the 500 most-recently-CREATED tracker rows -- not the 500
// highest-numbered ones, and not a real MAX() over the whole table. Since
// `created_at` on these rows doesn't reliably correlate with when an order
// number was actually granted (rows can be edited/backdated), that
// fallback could -- and did -- produce a number that collided with or fell
// out of true sequence order relative to numbers already granted by the
// real sequence, with no way to detect or undo it after the fact. It was
// also not atomic at all: two concurrent calls hitting the fallback at the
// same moment could compute and return the exact same "next" number.
//
// The fix is to retry the atomic RPC itself (transient failures are worth
// retrying) rather than fall back to a fabricated, unsafe number. If every
// retry fails, this throws -- callers MUST surface that to the user and
// abort the submission rather than proceeding without a real order number.
export const generateNextOrderNumber = async (supabase, { retries = 3, retryDelayMs = 800 } = {}) => {
  let lastError = null;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const { data, error } = await supabase.rpc("lto_get_next_order_number");
      if (error) throw error;
      if (data && typeof data === "string" && data.trim() !== "") {
        return data.trim();
      }
      throw new Error("RPC returned empty or invalid value");
    } catch (error) {
      lastError = error;
      console.error(`generateNextOrderNumber: attempt ${attempt}/${retries} failed`, error);
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs * attempt));
      }
    }
  }

  throw new Error(
    `Could not generate an order number after ${retries} attempts: ${lastError?.message || "unknown error"}. Please try again.`
  );
};
