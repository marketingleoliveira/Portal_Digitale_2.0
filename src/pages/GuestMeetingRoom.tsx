import {
  useEffect,
  useState
} from "react";

import {
  useNavigate,
  useParams
} from "react-router-dom";

import {
  Video
} from "lucide-react";

import MeetingConference
  from "@/components/MeetingConference";

interface GuestMeeting {
  name: string;
  meetingId: string;
  meetingCode: string;
  title: string;
  token: string;
  serverUrl: string;
}

export default function GuestMeetingRoom() {

  const {
    code
  } = useParams<{
    code: string
  }>();

  const navigate =
    useNavigate();

  const [
    meeting,
    setMeeting
  ] = useState<GuestMeeting | null>(
    null
  );


  useEffect(() => {

    if (!code) {
      return;
    }

    const key =
      `digitale_meeting_${code}`;

    const raw =
      sessionStorage.getItem(
        key
      );

    if (!raw) {

      navigate(
        `/entrar/${code}`,
        {
          replace: true
        }
      );

      return;
    }

    try {

      const parsed =
        JSON.parse(raw);

      if (
        !parsed.token
        ||
        !parsed.serverUrl
        ||
        !parsed.name
      ) {
        throw new Error(
          "Dados inválidos"
        );
      }

      setMeeting(
        parsed
      );

    } catch {

      sessionStorage.removeItem(
        key
      );

      navigate(
        `/entrar/${code}`,
        {
          replace: true
        }
      );
    }

  }, [
    code,
    navigate
  ]);


  if (!meeting) {
    return null;
  }


  return (
    <div className="h-screen flex flex-col bg-[#0b1220]">

      <header className="h-14 shrink-0 px-4 flex items-center gap-3 border-b border-white/10 bg-[#111827] text-white">

        <Video className="w-5 h-5 text-blue-400" />

        <div className="min-w-0">

          <p className="font-semibold truncate">
            {meeting.title}
          </p>

          <p className="text-xs text-white/50">
            {meeting.name} • Convidado
          </p>

        </div>

      </header>

      <div className="flex-1 min-h-0">

        <MeetingConference
          token={
            meeting.token
          }

          serverUrl={
            meeting.serverUrl
          }

          title={
            meeting.title
          }

          onLeave={() => {

            sessionStorage.removeItem(
              `digitale_meeting_${code}`
            );

            navigate(
              `/entrar/${code}`
            );
          }}
        />

      </div>

    </div>
  );
}
