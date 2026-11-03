(() => {
  "use strict";

  const isMeetingArea = () => {
    const path = window.location.pathname;

    return (
      path === "/reunioes" ||
      path.startsWith("/reuniao/") ||
      path.startsWith("/convidado/") ||
      path.startsWith("/entrar/")
    );
  };


  const translations = new Map(
    Object.entries({

      /* Áudio / microfone */
      "Microphone": "Microfone",
      "Microphone settings": "Configurações do microfone",
      "Microphone Settings": "Configurações do microfone",
      "Mute": "Desativar microfone",
      "Unmute": "Ativar microfone",
      "Mute microphone": "Desativar microfone",
      "Unmute microphone": "Ativar microfone",
      "Mute Microphone": "Desativar microfone",
      "Unmute Microphone": "Ativar microfone",
      "Enable microphone": "Ativar microfone",
      "Disable microphone": "Desativar microfone",
      "Turn on microphone": "Ativar microfone",
      "Turn off microphone": "Desativar microfone",
      "Audio": "Áudio",
      "Audio settings": "Configurações de áudio",
      "Audio Settings": "Configurações de áudio",
      "Audio input": "Entrada de áudio",
      "Audio output": "Saída de áudio",
      "Select audio input": "Selecionar microfone",
      "Select audio output": "Selecionar saída de áudio",
      "Start Audio": "Ativar áudio",
      "Stop Audio": "Desativar áudio",
      "Start audio": "Ativar áudio",
      "Stop audio": "Desativar áudio",

      /* Vídeo / câmera */
      "Camera": "Câmera",
      "Camera settings": "Configurações da câmera",
      "Camera Settings": "Configurações da câmera",
      "Enable camera": "Ativar câmera",
      "Disable camera": "Desativar câmera",
      "Turn on camera": "Ativar câmera",
      "Turn off camera": "Desativar câmera",
      "Start Video": "Ativar câmera",
      "Stop Video": "Desativar câmera",
      "Start video": "Ativar câmera",
      "Stop video": "Desativar câmera",
      "Video": "Vídeo",
      "Video settings": "Configurações de vídeo",
      "Video Settings": "Configurações de vídeo",
      "Video input": "Entrada de vídeo",
      "Select video input": "Selecionar câmera",

      /* Tela */
      "Screen Share": "Compartilhar tela",
      "Screen share": "Compartilhar tela",
      "Share Screen": "Compartilhar tela",
      "Share screen": "Compartilhar tela",
      "Start screen share": "Compartilhar tela",
      "Start Screen Share": "Compartilhar tela",
      "Stop screen share": "Parar compartilhamento",
      "Stop Screen Share": "Parar compartilhamento",
      "Stop sharing": "Parar compartilhamento",
      "You are sharing your screen": "Você está compartilhando sua tela",
      "Screen sharing": "Compartilhamento de tela",

      /* Pessoas */
      "Participants": "Participantes",
      "Participant": "Participante",
      "People": "Participantes",
      "Invite": "Convidar",
      "Invite people": "Convidar pessoas",
      "Invite People": "Convidar pessoas",
      "Copy invite link": "Copiar link do convite",
      "Copy Invite Link": "Copiar link do convite",
      "Copy link": "Copiar link",
      "Copy Link": "Copiar link",
      "Link copied": "Link copiado",
      "Host": "Anfitrião",
      "Guest": "Convidado",
      "You": "Você",
      "Remove participant": "Remover participante",
      "Remove Participant": "Remover participante",

      /* Chat */
      "Chat": "Chat",
      "Open chat": "Abrir chat",
      "Close chat": "Fechar chat",
      "Send": "Enviar",
      "Send message": "Enviar mensagem",
      "Send Message": "Enviar mensagem",
      "Type a message": "Digite uma mensagem",
      "Type a message...": "Digite uma mensagem...",
      "Message": "Mensagem",
      "Messages": "Mensagens",
      "No messages yet": "Nenhuma mensagem ainda",

      /* Mão / reações */
      "Raise hand": "Levantar a mão",
      "Raise Hand": "Levantar a mão",
      "Lower hand": "Abaixar a mão",
      "Lower Hand": "Abaixar a mão",
      "Reactions": "Reações",
      "Reaction": "Reação",

      /* Gravação */
      "Recording": "Gravação",
      "Record": "Gravar",
      "Start recording": "Iniciar gravação",
      "Start Recording": "Iniciar gravação",
      "Stop recording": "Parar gravação",
      "Stop Recording": "Parar gravação",
      "Recording in progress": "Gravação em andamento",
      "Recording started": "Gravação iniciada",
      "Recording stopped": "Gravação encerrada",
      "Automatic recording": "Gravação automática",
      "Automatic Recording": "Gravação automática",

      /* Controles gerais */
      "Settings": "Configurações",
      "Device settings": "Configurações dos dispositivos",
      "Device Settings": "Configurações dos dispositivos",
      "More": "Mais opções",
      "More options": "Mais opções",
      "More Options": "Mais opções",
      "Options": "Opções",
      "Close": "Fechar",
      "Cancel": "Cancelar",
      "Confirm": "Confirmar",
      "Save": "Salvar",
      "Back": "Voltar",
      "Continue": "Continuar",
      "Join": "Entrar",
      "Join meeting": "Entrar na reunião",
      "Join Meeting": "Entrar na reunião",
      "Enter meeting": "Entrar na reunião",
      "Enter Meeting": "Entrar na reunião",

      /* Saída */
      "Leave": "Sair",
      "Leave meeting": "Sair da reunião",
      "Leave Meeting": "Sair da reunião",
      "Disconnect": "Sair da reunião",
      "End call": "Encerrar chamada",
      "End Call": "Encerrar chamada",
      "End meeting": "Encerrar reunião",
      "End Meeting": "Encerrar reunião",

      /* Tela cheia / PiP */
      "Full screen": "Tela cheia",
      "Fullscreen": "Tela cheia",
      "Enter fullscreen": "Entrar em tela cheia",
      "Exit fullscreen": "Sair da tela cheia",
      "Picture in Picture": "Picture-in-Picture",
      "Picture-in-picture": "Picture-in-Picture",

      /* Estados */
      "Connecting": "Conectando",
      "Connecting...": "Conectando...",
      "Connected": "Conectado",
      "Disconnected": "Desconectado",
      "Reconnecting": "Reconectando",
      "Reconnecting...": "Reconectando...",
      "Connection lost": "Conexão perdida",
      "Connection Lost": "Conexão perdida",
      "Connection quality": "Qualidade da conexão",
      "Connection Quality": "Qualidade da conexão",
      "Excellent": "Excelente",
      "Good": "Boa",
      "Poor": "Ruim",
      "Offline": "Desconectado",
      "Loading": "Carregando",
      "Loading...": "Carregando...",

      /* Sala */
      "Meeting": "Reunião",
      "Meeting room": "Sala de reunião",
      "Meeting Room": "Sala de reunião",
      "Meeting code": "Código da reunião",
      "Meeting Code": "Código da reunião",
      "Meeting link": "Link da reunião",
      "Meeting Link": "Link da reunião",
      "Waiting room": "Sala de espera",
      "Waiting Room": "Sala de espera",
      "Waiting for host": "Aguardando o anfitrião",
      "Waiting for the host": "Aguardando o anfitrião",
      "Waiting for others to join": "Aguardando outros participantes",
      "No one else is here": "Nenhum outro participante na sala",

      /* Dispositivos */
      "Speaker": "Alto-falante",
      "Speakers": "Alto-falantes",
      "Default": "Padrão",
      "Default device": "Dispositivo padrão",
      "Select device": "Selecionar dispositivo",
      "Select Device": "Selecionar dispositivo",

      /* Permissões */
      "Permission denied": "Permissão negada",
      "Camera permission denied": "Permissão da câmera negada",
      "Microphone permission denied": "Permissão do microfone negada",
      "Allow camera access": "Permitir acesso à câmera",
      "Allow microphone access": "Permitir acesso ao microfone",

      /* Diversos */
      "Unknown": "Desconhecido",
      "Unknown participant": "Participante desconhecido",
      "No video": "Sem vídeo",
      "No audio": "Sem áudio",
      "Copied": "Copiado",
      "Copy": "Copiar",
      "Download": "Baixar",
      "Retry": "Tentar novamente",
      "Refresh": "Atualizar",
      "Open": "Abrir",
      "Delete": "Excluir",
      "Remove": "Remover"
    })
  );


  const patterns = [
    [
      /^Mute (.+)$/i,
      "Desativar microfone de $1"
    ],
    [
      /^Unmute (.+)$/i,
      "Ativar microfone de $1"
    ],
    [
      /^Remove (.+)$/i,
      "Remover $1"
    ],
    [
      /^Camera of (.+)$/i,
      "Câmera de $1"
    ],
    [
      /^Microphone of (.+)$/i,
      "Microfone de $1"
    ],
    [
      /^(.+) is speaking$/i,
      "$1 está falando"
    ],
    [
      /^(.+) joined$/i,
      "$1 entrou"
    ],
    [
      /^(.+) left$/i,
      "$1 saiu"
    ],
    [
      /^Connecting to (.+)$/i,
      "Conectando a $1"
    ],
  ];


  function translateValue(value) {

    if (
      !value
      ||
      typeof value !== "string"
    ) {
      return value;
    }


    const trimmed =
      value.trim();


    if (!trimmed) {
      return value;
    }


    if (
      translations.has(
        trimmed
      )
    ) {

      return value.replace(
        trimmed,
        translations.get(
          trimmed
        )
      );
    }


    for (
      const [
        regex,
        replacement
      ]
      of patterns
    ) {

      if (
        regex.test(
          trimmed
        )
      ) {

        regex.lastIndex = 0;

        return value.replace(
          trimmed,
          trimmed.replace(
            regex,
            replacement
          )
        );
      }
    }


    return value;
  }


  function translateElement(
    element
  ) {

    if (
      !(element instanceof Element)
    ) {
      return;
    }


    const attributes = [
      "title",
      "aria-label",
      "placeholder",
      "alt",
      "data-tooltip-content",
    ];


    for (
      const attribute
      of attributes
    ) {

      const value =
        element.getAttribute(
          attribute
        );


      if (!value) {
        continue;
      }


      const translated =
        translateValue(
          value
        );


      if (
        translated
        !==
        value
      ) {

        element.setAttribute(
          attribute,
          translated
        );
      }
    }
  }


  function translateTextNode(
    node
  ) {

    if (
      node.nodeType
      !==
      Node.TEXT_NODE
    ) {
      return;
    }


    const parent =
      node.parentElement;


    if (!parent) {
      return;
    }


    if (
      [
        "SCRIPT",
        "STYLE",
        "CODE",
        "PRE"
      ].includes(
        parent.tagName
      )
    ) {
      return;
    }


    const original =
      node.nodeValue;


    if (!original) {
      return;
    }


    const translated =
      translateValue(
        original
      );


    if (
      translated
      !==
      original
    ) {

      node.nodeValue =
        translated;
    }
  }


  function translateTree(
    root
  ) {

    if (!isMeetingArea()) {
      return;
    }


    document.documentElement.lang =
      "pt-BR";


    if (
      root instanceof Element
    ) {

      translateElement(
        root
      );
    }


    const walker =
      document.createTreeWalker(
        root,
        NodeFilter.SHOW_ELEMENT
        |
        NodeFilter.SHOW_TEXT
      );


    let node =
      walker.currentNode;


    while (node) {

      if (
        node.nodeType
        ===
        Node.ELEMENT_NODE
      ) {

        translateElement(
          node
        );

      } else if (
        node.nodeType
        ===
        Node.TEXT_NODE
      ) {

        translateTextNode(
          node
        );
      }


      node =
        walker.nextNode();
    }
  }


  let scheduled =
    false;


  function scheduleTranslate() {

    if (scheduled) {
      return;
    }


    scheduled =
      true;


    requestAnimationFrame(
      () => {

        scheduled =
          false;

        translateTree(
          document.body
        );
      }
    );
  }


  const observer =
    new MutationObserver(
      mutations => {

        if (!isMeetingArea()) {
          return;
        }


        let shouldTranslate =
          false;


        for (
          const mutation
          of mutations
        ) {

          if (
            mutation.type
            ===
            "childList"
            ||
            mutation.type
            ===
            "attributes"
            ||
            mutation.type
            ===
            "characterData"
          ) {

            shouldTranslate =
              true;

            break;
          }
        }


        if (shouldTranslate) {

          scheduleTranslate();
        }
      }
    );


  function start() {

    translateTree(
      document.body
    );


    observer.observe(
      document.body,
      {
        subtree:
          true,

        childList:
          true,

        characterData:
          true,

        attributes:
          true,

        attributeFilter: [
          "title",
          "aria-label",
          "placeholder",
          "alt",
          "data-tooltip-content",
        ],
      }
    );
  }


  if (
    document.readyState
    ===
    "loading"
  ) {

    document.addEventListener(
      "DOMContentLoaded",
      start,
      {
        once:
          true
      }
    );

  } else {

    start();
  }
})();
