import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";


export default function ProfileSection({
  email,
  isAdmin,
  isOwner = false,
  handleLogout,
  onOpenSubscriptions,
  onOpenSettings,
  onOpenWallet,
}) {
  const [subscription, setSubscription] = useState(null);
  const [loadingSubscription, setLoadingSubscription] = useState(true);


  const [fullName, setFullName] = useState("");
  const [savedName, setSavedName] = useState("");
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [savingName, setSavingName] = useState(false);
  const [profileMessage, setProfileMessage] = useState("");
  const [profileMessageType, setProfileMessageType] = useState("");


  useEffect(() => {
    let alive = true;


    async function loadProfile() {
      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();


        if (userError) throw userError;
        if (!user) return;


        const { data, error } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", user.id)
          .maybeSingle();


        if (error) throw error;


        if (alive) {
          const name = data?.full_name || "";
          setFullName(name);
          setSavedName(name);
        }
      } catch (error) {
        if (alive) {
          setProfileMessage(
            error?.message || "Could not load your profile name."
          );
          setProfileMessageType("error");
        }
      } finally {
        if (alive) setLoadingProfile(false);
      }
    }


    async function loadSubscription() {
      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();


        if (userError) throw userError;
        if (!user) return;


        const { data, error } = await supabase
          .from("subscriptions")
          .select(`
            status,
            ends_at,
            plan_slug,
            subscription_plans (
              name,
              billing_interval
            )
          `)
          .eq("user_id", user.id)
          .in("status", ["active", "trialing", "past_due"])
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();


        if (error) throw error;
        if (!alive) return;


        const isStillValid =
          data &&
          (!data.ends_at || new Date(data.ends_at) > new Date());


        setSubscription(isStillValid ? data : null);
      } catch (error) {
        console.error("Could not load membership:", error);
        if (alive) setSubscription(null);
      } finally {
        if (alive) setLoadingSubscription(false);
      }
    }


    loadProfile();
    loadSubscription();


    return () => {
      alive = false;
    };
  }, []);


  async function handleSaveName(event) {
    event.preventDefault();
    setProfileMessage("");


    const normalizedName = fullName.trim().replace(/\s+/g, " ");


    if (!normalizedName || normalizedName.length > 80) {
      setProfileMessage("Enter a name between 1 and 80 characters.");
      setProfileMessageType("error");
      return;
    }


    setSavingName(true);


    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();


      if (userError) throw userError;


      if (!user) {
        throw new Error("Please sign in to update your profile.");
      }


      const { data, error } = await supabase.rpc(
        "save_own_profile_name",
        {
          p_full_name: normalizedName,
        },
      );


      if (error) throw error;


      const savedNameValue =
        typeof data === "string" ? data : normalizedName;


      setFullName(savedNameValue);
      setSavedName(savedNameValue);
      setProfileMessage("Your profile name was saved.");
      setProfileMessageType("success");
    } catch (error) {
      setProfileMessage(
        error?.message || "Could not save your profile name."
      );
      setProfileMessageType("error");
    } finally {
      setSavingName(false);
    }
  }


  const planName =
    subscription?.subscription_plans?.name ||
    subscription?.plan_slug ||
    "Membership";


  const avatarLetter =
    savedName.trim().charAt(0).toUpperCase() || "S";


  return (
    <section className="section-page">
      <div className="profile-layout">
        <div className="profile-avatar">{avatarLetter}</div>


        <div>
          <p className="eyebrow">ACCOUNT</p>
          <h1>{savedName || "Your profile"}</h1>
          <p className="profile-email">{email}</p>
          <p className="profile-account-type">
            {isOwner
              ? "Owner account"
              : isAdmin
                ? "Administrator account"
                : "Customer account"}
          </p>
        </div>
      </div>


      <section className="subscription-status-card">
        <p className="eyebrow">PUBLIC PROFILE</p>
        <h2>Your name</h2>


        <p>
          This name will be visible to other users beside your film
          comments. Choose a name you are comfortable sharing publicly.
        </p>


        <form className="auth-form" onSubmit={handleSaveName}>
          <label htmlFor="profile-full-name">Display name</label>


          <input
            id="profile-full-name"
            type="text"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            maxLength={80}
            placeholder="Enter your name"
            disabled={loadingProfile || savingName}
            required
          />


          <button
            className="media-watch-button"
            type="submit"
            disabled={loadingProfile || savingName}
          >
            {loadingProfile
              ? "Loading…"
              : savingName
                ? "Saving…"
                : "Save name"}
          </button>
        </form>


        {profileMessage && (
          <p
            className={`notice ${profileMessageType}`}
            role={profileMessageType === "error" ? "alert" : "status"}
          >
            {profileMessage}
          </p>
        )}
      </section>


      <section className="subscription-status-card profile-membership-card">
        <p className="eyebrow">MEMBERSHIP</p>


        {loadingSubscription ? (
          <p>Loading membership status…</p>
        ) : subscription ? (
          <>
            <h2>{planName}</h2>


            <p>
              Status: <strong>{subscription.status}</strong>
            </p>


            {subscription.ends_at && (
              <p>
                Access until:{" "}
                <strong>
                  {new Date(subscription.ends_at).toLocaleDateString()}
                </strong>
              </p>
            )}


            <p>
              Your membership gives you access to subscription-only
              films while it is active.
            </p>
          </>
        ) : (
          <>
            <h2>No active membership</h2>
            <p>Subscribe to unlock films marked as subscription-only.</p>


            <button
              className="media-watch-button"
              type="button"
              onClick={onOpenSubscriptions}
            >
              View memberships
            </button>
          </>
        )}
      </section>


      <div className="profile-settings">
        <button
          type="button"
          onClick={onOpenSettings}
        >
          Account settings
        </button>

        <button
          type="button"
          onClick={onOpenWallet}
        >
          Wallet payment history
        </button>

        <button
          type="button"
          onClick={onOpenWallet}
        >
          Wallet balance
        </button>

        <button
          type="button"
          onClick={onOpenSubscriptions}
        >
          Memberships
        </button>

        <button
          className="danger-button"
          type="button"
          onClick={handleLogout}
        >
          Log out
        </button>
      </div>
    </section>
  );
}