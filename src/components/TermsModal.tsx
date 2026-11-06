import React from 'react';
import { FolioIcon } from './FolioIcon';

interface TermsModalProps {
  onClose: () => void;
}

export const TermsModal: React.FC<TermsModalProps> = ({ onClose }) => {
  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Conditions Générales d’Utilisation et Confidentialité"
      onClick={onClose}
    >
      <div
        className="modal terms-modal"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: '720px',
          maxHeight: '88vh',
          display: 'flex',
          flexDirection: 'column',
          padding: 0,
          overflow: 'hidden',
        }}
      >
        {/* En-tête fixe */}
        <div
          className="modal-header"
          style={{
            padding: '22px 26px 18px',
            borderBottom: '1px solid var(--line)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
          }}
        >
          <div>
            <p className="section-kicker" style={{ margin: 0, fontSize: '0.72rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)' }}>
              Légal &amp; Confidentialité
            </p>
            <h3 style={{ margin: '4px 0 0', fontSize: '1.25rem', fontFamily: 'var(--serif)' }}>
              Conditions Générales d’Utilisation
            </h3>
          </div>
          <button
            type="button"
            className="icon-close"
            onClick={onClose}
            aria-label="Fermer"
            style={{
              background: 'transparent',
              border: 0,
              cursor: 'pointer',
              color: 'var(--ink)',
              padding: '6px',
              borderRadius: '8px',
              display: 'inline-flex',
            }}
          >
            <FolioIcon name="close" size={20} />
          </button>
        </div>

        {/* Corps défilant */}
        <div
          className="terms-content"
          style={{
            padding: '24px 28px',
            overflowY: 'auto',
            fontSize: '0.9rem',
            lineHeight: 1.68,
            color: 'var(--ink)',
          }}
        >
          <p style={{ marginTop: 0, fontSize: '0.82rem', color: 'var(--muted)' }}>
            <strong>Application : Folio</strong> · Dernière mise à jour : Novembre 2026
          </p>

          <h4 style={{ fontSize: '1rem', marginTop: '20px', marginBottom: '8px', color: 'var(--forest)' }}>
            1. Présentation de l’Application et Objet
          </h4>
          <p>
            Les présentes Conditions Générales d’Utilisation (ci-après les « CGU ») régissent l’accès et l’utilisation de l’application <strong>Folio</strong> (ci-après le « Service »). Folio est une bibliothèque numérique personnelle permettant aux utilisateurs d’organiser, synchroniser et lire des documents et livres numériques dans différents formats (PDF, EPUB, TXT, Markdown) au sein d’un environnement sécurisé.
          </p>
          <p>
            L’accès et l’utilisation du Service impliquent l’acceptation sans réserve des présentes CGU par l’utilisateur.
          </p>

          <h4 style={{ fontSize: '1rem', marginTop: '22px', marginBottom: '8px', color: 'var(--forest)' }}>
            2. Création de Compte et Sécurité
          </h4>
          <p>
            <strong>2.1 Inscription :</strong> Pour utiliser le Service, l’utilisateur doit créer un compte personnel en fournissant une adresse email valide et un mot de passe robuste (10 caractères minimum).
          </p>
          <p>
            <strong>2.2 Confidentialité des identifiants :</strong> L’utilisateur est seul responsable du maintien de la confidentialité de ses identifiants. Toute activité réalisée depuis son compte est présumée émaner de lui.
          </p>
          <p>
            <strong>2.3 Architecture de chiffrement (Coffre-fort / Vault) :</strong> Folio propose un mécanisme de coffre-fort chiffré de bout en bout (AES-256-GCM). Les clés de déchiffrement et le mot de passe maître restent sous la garde exclusive de l’utilisateur. <em>En cas de perte définitive de la clé d’accès ou du mot de passe maître par l’utilisateur, aucune récupération des contenus chiffrés ne pourra être effectuée par l’éditeur du Service.</em>
          </p>

          <h4 style={{ fontSize: '1rem', marginTop: '22px', marginBottom: '8px', color: 'var(--forest)' }}>
            3. Propriété Intellectuelle et Responsabilité des Contenus
          </h4>
          <p>
            <strong>3.1 Propriété des documents :</strong> L’utilisateur conserve l’entière propriété intellectuelle des fichiers, textes, annotations et documents qu’il importe dans Folio.
          </p>
          <p>
            <strong>3.2 Légalité des contenus :</strong> L’utilisateur s’engage formellement à ne téléverser ou lier que des œuvres et fichiers dont il possède les droits légaux d’usage, de copie privée ou de diffusion (œuvres libres de droit, domaine public ou fichiers acquis légalement pour un usage personnel). Il est strictement interdit d’utiliser le Service pour stocker, partager ou diffuser des contenus illicites, piratés, diffamatoires ou contraires à l’ordre public. L’éditeur décline toute responsabilité quant à la nature ou la provenance des fichiers importés par les utilisateurs.
          </p>

          <h4 style={{ fontSize: '1rem', marginTop: '22px', marginBottom: '8px', color: 'var(--forest)' }}>
            4. Services Tiers (Intégration Google Drive)
          </h4>
          <p>
            Folio offre une fonctionnalité optionnelle permettant de connecter un compte Google Drive personnel :
          </p>
          <ul style={{ paddingLeft: '20px', margin: '8px 0' }}>
            <li>Cette connexion s’effectue via le protocole sécurisé OAuth 2.0 fourni par Google.</li>
            <li>Folio n’accède qu’aux fichiers et dossiers que l’utilisateur choisit explicitement de synchroniser ou de stocker dans le dossier dédié à l’application.</li>
            <li>Les identifiants et jetons d’accès API sont stockés sous forme scellée et chiffrée.</li>
            <li>L’utilisateur peut révoquer l’accès à son compte Google Drive à tout moment depuis les réglages de son compte Google ou depuis l’interface de Folio.</li>
          </ul>

          <h4 style={{ fontSize: '1rem', marginTop: '22px', marginBottom: '8px', color: 'var(--forest)' }}>
            5. Protection des Données Personnelles (RGPD)
          </h4>
          <p>
            Folio s’engage à respecter la vie privée de ses utilisateurs conformément au Règlement Général sur la Protection des Données (RGPD) :
          </p>
          <ul style={{ paddingLeft: '20px', margin: '8px 0' }}>
            <li><strong>Données collectées :</strong> adresse email (authentification), mot de passe sous forme d’empreinte cryptographique scrypt, métadonnées techniques de session (adresse IP, navigateur pour les appareils connectés), et données de lecture chiffrées (progression, signets, notes).</li>
            <li><strong>Finalité :</strong> ces données ont pour unique finalité le bon fonctionnement du Service et la synchronisation de la bibliothèque. Aucune donnée n’est vendue, louée ou cédée à des tiers.</li>
            <li><strong>Droits de l’utilisateur :</strong> l’utilisateur dispose d’un droit d’accès, de rectification, d’exportation et de suppression de ses données personnelles.</li>
            <li><strong>Suppression des données :</strong> l’utilisateur peut à tout moment supprimer l’intégralité de ses livres via le bouton dédié dans les Paramètres, réinitialiser son coffre, ou demander la suppression définitive de son compte.</li>
          </ul>

          <h4 style={{ fontSize: '1rem', marginTop: '22px', marginBottom: '8px', color: 'var(--forest)' }}>
            6. Disponibilité du Service et Limitation de Responsabilité
          </h4>
          <p>
            Le Service est fourni « en l’état ». L’éditeur s’efforce d’assurer une disponibilité continue mais ne garantit pas une absence totale d’interruptions techniques ou de maintenances. L’éditeur ne saurait être tenu responsable des pertes de données résultant d’une manipulation de l’utilisateur ou de la perte de ses clés de chiffrement. Il est fortement conseillé de conserver des copies de sauvegarde de ses documents originaux.
          </p>

          <h4 style={{ fontSize: '1rem', marginTop: '22px', marginBottom: '8px', color: 'var(--forest)' }}>
            7. Modifications des CGU
          </h4>
          <p>
            L’éditeur se réserve le droit d’adapter ou de mettre à jour les présentes conditions à tout moment. La date de dernière mise à jour sera indiquée en en-tête. La poursuite de l’utilisation du Service après publication des modifications vaut acceptation des nouvelles CGU.
          </p>

          <h4 style={{ fontSize: '1rem', marginTop: '22px', marginBottom: '8px', color: 'var(--forest)' }}>
            8. Droit Applicable et Juridiction
          </h4>
          <p style={{ marginBottom: 0 }}>
            Les présentes CGU sont soumises au droit français et aux réglementations européennes en vigueur. Tout litige relatif à leur interprétation ou à leur exécution fera l’objet d’une tentative de résolution amiable avant toute action judiciaire.
          </p>
        </div>

        {/* Pied de la modale */}
        <div
          style={{
            padding: '14px 24px',
            borderTop: '1px solid var(--line)',
            display: 'flex',
            justifyContent: 'flex-end',
            background: 'var(--paper)',
          }}
        >
          <button
            type="button"
            className="secondary-button"
            onClick={onClose}
            style={{ minWidth: '100px', height: '38px', borderRadius: '8px' }}
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
};
