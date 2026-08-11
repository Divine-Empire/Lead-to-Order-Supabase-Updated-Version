import supabase from "../../utils/supabase";

/**
 * Generates and assigns a client code for a company when order status is Yes.
 * @param {string} companyName - The name of the company to process
 * @returns {Promise<boolean>} True if successful, false otherwise
 */
export const generateAndAssignClientCode = async (companyName) => {
  try {
    if (!companyName) return false;

    const compNameTrimmed = companyName.trim();

    // 1. Fetch client details from client_master
    const { data: clientMatches, error: fetchError } = await supabase
      .from("lto_client_master")
      .select("uuid, client_code, company_group_name")
      .ilike("company_name", compNameTrimmed)
      .limit(1);

    const clientData = clientMatches && clientMatches.length > 0 ? clientMatches[0] : null;

    if (fetchError || !clientData) {
      console.error("Error fetching client or client not found:", fetchError);
      return false;
    }

    // 2. If client already has a code, skip
    if (clientData.client_code) {
      return true; // Already processed
    }

    let newClientCode = "";
    const groupName = clientData.company_group_name ? clientData.company_group_name.trim() : null;

    // Helper function to fetch all client codes (handles 1000 row limit)
    const fetchAllClientCodes = async (groupQuery = null) => {
      let codes = [];
      let from = 0;
      const step = 1000;
      let fetchMore = true;

      while (fetchMore) {
        let query = supabase
          .from("lto_client_master")
          .select("client_code")
          .not("client_code", "is", null)
          .range(from, from + step - 1);

        if (groupQuery) {
          query = query.ilike("company_group_name", groupQuery);
        }

        const { data, error } = await query;
        if (error) throw error;

        if (data && data.length > 0) {
          codes = [...codes, ...data];
          from += step;
          if (data.length < step) fetchMore = false;
        } else {
          fetchMore = false;
        }
      }
      return codes;
    };

    if (!groupName || groupName.trim().toUpperCase() === "OTHER CLIENTS") {
      // Logic for NO group or OTHER CLIENTS
      // Fetch ALL client codes using pagination
      const allCodes = await fetchAllClientCodes();

      let maxCodeNum = 0;
      allCodes.forEach(row => {
        if (row.client_code) {
          // Match C or C- followed by numbers only (base code)
          const match = row.client_code.match(/^C-?(\d+)$/i);
          if (match) {
            const num = parseInt(match[1], 10);
            if (num > maxCodeNum) maxCodeNum = num;
          }
        }
      });

      const nextNum = maxCodeNum + 1;
      newClientCode = `C${String(nextNum).padStart(3, '0')}`;
    } else {
      // Logic for HAS group
      // Fetch all clients in this group that have a client_code
      const groupClients = await fetchAllClientCodes(groupName);

      if (!groupClients || groupClients.length === 0) {
        // First company in this group. Needs a new base code.
        const allCodes = await fetchAllClientCodes();

        let maxCodeNum = 0;
        allCodes.forEach(row => {
          if (row.client_code) {
            // Match C or C- followed by numbers only
            const match = row.client_code.match(/^C-?(\d+)$/i);
            if (match) {
              const num = parseInt(match[1], 10);
              if (num > maxCodeNum) maxCodeNum = num;
            }
          }
        });

        const nextNum = maxCodeNum + 1;
        newClientCode = `C${String(nextNum).padStart(3, '0')}`;
      } else {
        // Group already has at least one client code.
        // Find the base code for this group and highest suffix.
        let baseCodeStr = "";
        
        // Find a base code or derive it from an existing one
        // Base code format CXXX (or legacy C-XXX)
        for (const gc of groupClients) {
           const match = gc.client_code.match(/^C-?(\d+)[A-Z]*$/i);
           if (match) {
               baseCodeStr = `C${match[1]}`;
               break;
           }
        }

        if(!baseCodeStr) {
           console.error("Could not determine base code for group", groupName);
           return false;
        }

        // Now find the highest suffix for this base code
        let maxSuffixCode = 0; // 0 = no suffix, 1 = A, 2 = B, etc.
        groupClients.forEach(gc => {
            const upperCode = gc.client_code.toUpperCase().replace(/^C-/, "C");
            if (upperCode.startsWith(baseCodeStr.toUpperCase())) {
               const suffix = upperCode.substring(baseCodeStr.length);
               if (suffix === "") {
                   // no suffix means max is at least 0
               } else if (suffix.length === 1) {
                   const charCode = suffix.charCodeAt(0) - 64; // 'A' is 65
                   if (charCode > maxSuffixCode) maxSuffixCode = charCode;
               }
            }
        });

        const nextSuffixChar = String.fromCharCode(65 + maxSuffixCode); // If max is 0, next is A
        newClientCode = `${baseCodeStr}${nextSuffixChar}`;
      }
    }

    // 3. Update the client_master table with the new code
    const { data: updated, error: updateError } = await supabase
      .from("lto_client_master")
      .update({ client_code: newClientCode })
      .eq("uuid", clientData.uuid)
      .select()
      .maybeSingle();

    if (updateError) throw updateError;
    if (!updated) {
      console.error("Client code update affected no row (client may have been deleted mid-operation):", clientData.uuid);
      return false;
    }

    console.log(`Generated and assigned client code ${newClientCode} for ${compNameTrimmed}`);
    return true;

  } catch (err) {
    console.error("Exception in generateAndAssignClientCode:", err);
    return false;
  }
};
