import React, { useState } from 'react';
import { FolioIcon } from './FolioIcon';

export interface LegalModalProps {
  initialTab?: 'mentions' | 'cgu';
  onClose: () => void;
}

export const LegalModal: React.FC<LegalModalProps> = ({ initialTab = 'mentions', onClose }) => {
  const [activeTab, setActiveTab] = useState<'mentions' | 'cgu'>(initialTab);

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Mentions légales et Conditions Générales"
      onClick={onClose}
    >
      <div
        className="modal terms-modal"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: '760px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          padding: 0,
          overflow: 'hidden',
          backgroundColor: 'var(--paper)',
          borderRadius: '16px',
          boxShadow: '0 20px 45px rgba(0,0,0,0.25)',
        }}
      >
        {/* En-tête fixe avec sélecteur d'onglets */}
        <div
          className="modal-header"
          style={{
            padding: '20px 26px 14px',
            borderBottom: '1px solid var(--line)',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            flexShrink: 0,
            backgroundColor: 'var(--paper)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
            <div>
              <p
                className="section-kicker"
                style={{
                  margin: 0,
                  fontSize: '0.72rem',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: 'var(--muted)',
                }}
              >
                Informations Juridiques &amp; Réglementaires
              </p>
              <h3 style={{ margin: '4px 0 0', fontSize: '1.28rem', fontFamily: 'var(--serif)' }}>
                {activeTab === 'mentions' ? 'Mentions Légales' : 'Conditions Générales d’Utilisation'}
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

          {/* Sélecteur d'onglets */}
          <div
            style={{
              display: 'inline-flex',
              gap: '6px',
              backgroundColor: 'var(--surface, rgba(0,0,0,0.04))',
              padding: '4px',
              borderRadius: '10px',
              alignSelf: 'flex-start',
            }}
          >
            <button
              type="button"
              onClick={() => setActiveTab('mentions')}
              style={{
                border: 0,
                cursor: 'pointer',
                padding: '6px 14px',
                borderRadius: '8px',
                fontSize: '0.85rem',
                fontWeight: activeTab === 'mentions' ? 600 : 500,
                background: activeTab === 'mentions' ? 'var(--forest, #15392d)' : 'transparent',
                color: activeTab === 'mentions' ? '#ffffff' : 'var(--muted)',
                transition: 'all 0.15s ease',
              }}
            >
              Mentions Légales
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('cgu')}
              style={{
                border: 0,
                cursor: 'pointer',
                padding: '6px 14px',
                borderRadius: '8px',
                fontSize: '0.85rem',
                fontWeight: activeTab === 'cgu' ? 600 : 500,
                background: activeTab === 'cgu' ? 'var(--forest, #15392d)' : 'transparent',
                color: activeTab === 'cgu' ? '#ffffff' : 'var(--muted)',
                transition: 'all 0.15s ease',
              }}
            >
              Conditions d’Utilisation (CGU)
            </button>
          </div>
        </div>

        {/* Corps défilant */}
        <div
          className="terms-content"
          style={{
            padding: '24px 28px',
            overflowY: 'auto',
            fontSize: '0.92rem',
            lineHeight: 1.68,
            color: 'var(--ink)',
          }}
        >
          {activeTab === 'mentions' ? (
            /* ==================== ONGLET 1 : MENTIONS LÉGALES ==================== */
            <div>
              <p style={{ marginTop: 0, fontSize: '0.82rem', color: 'var(--muted)' }}>
                <strong>Conformité :</strong> Loi n° 2004-575 du 21 juin 2004 pour la Confiance dans l’Économie Numérique (LCEN) &amp; Règlement Général sur la Protection des Données (RGPD). Dernière mise à jour : Novembre 2026.
              </p>

              <h4 style={{ fontSize: '1.02rem', marginTop: '22px', marginBottom: '8px', color: 'var(--forest)' }}>
                1. Éditeur du Site &amp; Direction de la Publication
              </h4>
              <p>
                Le présent service numérique (englobant la page d'accueil, l’application de lecture <strong>Folio</strong> et le portail de recherche <strong>Études</strong>) est édité et administré par :
              </p>
              <ul style={{ paddingLeft: '22px', margin: '8px 0' }}>
                <li><strong>Éditeur et Directeur de la publication :</strong> Axel Samama</li>
                <li><strong>Adresse de contact :</strong> <a href="mailto:samamaaxel@gmail.com" style={{ color: 'var(--forest)', textDecoration: 'underline' }}>samamaaxel@gmail.com</a></li>
                <li><strong>Statut :</strong> Éditeur particulier et développeur de la plateforme</li>
              </ul>

              <h4 style={{ fontSize: '1.02rem', marginTop: '22px', marginBottom: '8px', color: 'var(--forest)' }}>
                2. Hébergement du Service
              </h4>
              <p>
                L’ensemble de la plateforme, des applications web et des bases de données associées est hébergé sur une infrastructure dédiée en France :
              </p>
              <ul style={{ paddingLeft: '22px', margin: '8px 0' }}>
                <li><strong>Hébergeur :</strong> Infrastructure serveur dédiée / Machine Virtuelle Freebox VM (Déploiement sous conteneur Linux &amp; serveur Caddy)</li>
                <li><strong>Opérateur réseau :</strong> Freebox SAS / Groupe Iliad</li>
                <li><strong>Localisation physique des données :</strong> France (Union Européenne)</li>
              </ul>

              <h4 style={{ fontSize: '1.02rem', marginTop: '22px', marginBottom: '8px', color: 'var(--forest)' }}>
                3. Propriété Intellectuelle
              </h4>
              <p>
                L’architecture logicielle, le code source, l'ergonomie, les chartes graphiques, maquettes, logos et interfaces interactives sont la propriété intellectuelle exclusive d’Axel Samama, au titre du droit d’auteur et de la propriété intellectuelle.
              </p>
              <p>
                Les documents, fichiers, livres numériques, études, articles, notes de recherche et annotations déposés, synchronisés ou consultés par les utilisateurs restent la propriété exclusive de leurs auteurs et titulaires de droits d’auteur respectifs. L’éditeur ne revendique aucun droit de propriété sur les contenus téléversés par les utilisateurs.
              </p>

              <h4 style={{ fontSize: '1.02rem', marginTop: '22px', marginBottom: '8px', color: 'var(--forest)' }}>
                4. Protection des Données Personnelles (RGPD)
              </h4>
              <p>
                Le traitement de vos données est opéré dans le respect le plus strict du Règlement (UE) 2016/679 du 27 avril 2016 (RGPD) et de la loi Informatique et Libertés :
              </p>
              <ul style={{ paddingLeft: '22px', margin: '8px 0' }}>
                <li><strong>Responsable du traitement :</strong> Axel Samama (<a href="mailto:samamaaxel@gmail.com" style={{ color: 'var(--forest)', textDecoration: 'underline' }}>samamaaxel@gmail.com</a>).</li>
                <li><strong>Données collectées :</strong> adresse de courrier électronique (pour l'authentification), mot de passe sous forme d’empreinte cryptographique scrypt unilatérale, métadonnées techniques de session (adresse IP, type d'appareil) et données de lecture (progression, listes thématiques, signets).</li>
                <li><strong>Finalité :</strong> ces données ont pour objectif exclusif la fourniture du service de lecture et de synchronisation entre vos appareils.</li>
                <li><strong>Non-commercialisation :</strong> Aucune donnée personnelle n’est vendue, louée, cédée, profilée ou transmise à des tiers ou à des annonceurs publicitaires.</li>
                <li><strong>Droits de l’utilisateur :</strong> Vous bénéficiez d’un droit permanent d’accès, de rectification, de portabilité, d'effacement de vos données personnelles et de suppression intégrale de votre compte par simple demande par courriel.</li>
              </ul>

              <h4 style={{ fontSize: '1.02rem', marginTop: '22px', marginBottom: '8px', color: 'var(--forest)' }}>
                5. Politique relative aux Cookies &amp; Traceurs (CNIL)
              </h4>
              <p>
                Conformément aux délibérations et directives de la <strong>Commission Nationale de l’Informatique et des Libertés (CNIL)</strong> et de la directive européenne <em>ePrivacy</em> :
              </p>
              <ul style={{ paddingLeft: '22px', margin: '8px 0' }}>
                <li>Le site utilise <strong>exclusivement un cookie technique de session</strong> (nommé <code>refresh_token</code>, sécurisé en mode <code>HttpOnly</code>, <code>SameSite=Strict</code> et <code>Secure</code>).</li>
                <li>Ce cookie est <strong>strictement nécessaire</strong> à la fourniture du service et au maintien de votre session connectée. Il est par conséquent <strong>légalement exempté de consentement préalable</strong>.</li>
                <li>Le site <strong>ne comporte aucun cookie publicitaire, aucun outil d'analyse comportementale tiers (pas de Google Analytics, ni de pixels publicitaires de réseaux sociaux)</strong>. Aucun bandeau intrusif d'acceptation de cookies n'est donc nécessaire.</li>
              </ul>

              <h4 style={{ fontSize: '1.02rem', marginTop: '22px', marginBottom: '8px', color: 'var(--forest)' }}>
                6. Droit Applicable
              </h4>
              <p style={{ marginBottom: 0 }}>
                Les présentes mentions légales sont régies par le droit français. En cas de différend concernant leur interprétation ou leur application, une résolution amiable sera privilégiée avant toute saisine des tribunaux français compétents.
              </p>
            </div>
          ) : (
            /* ==================== ONGLET 2 : CGU & CONFIDENTIALITÉ ==================== */
            <div>
              <p style={{ marginTop: 0, fontSize: '0.82rem', color: 'var(--muted)' }}>
                <strong>Application : Folio &amp; Études</strong> · Dernière mise à jour : Novembre 2026
              </p>

              <h4 style={{ fontSize: '1.02rem', marginTop: '20px', marginBottom: '8px', color: 'var(--forest)' }}>
                1. Présentation de l’Application et Objet
              </h4>
              <p>
                Les présentes Conditions Générales d’Utilisation (ci-après les « CGU ») régissent l’accès et l’utilisation de l’application <strong>Folio</strong> et du portail <strong>Études</strong> (ci-après le « Service »). Folio et Études constituent un environnement numérique personnel permettant aux utilisateurs d’organiser, synchroniser et lire des documents, revues et livres numériques dans différents formats (PDF, EPUB, TXT, Markdown) au sein d’un espace calme et personnalisé.
              </p>
              <p>
                L’accès et l’utilisation du Service impliquent l’acceptation sans réserve des présentes CGU par l’utilisateur.
              </p>

              <h4 style={{ fontSize: '1.02rem', marginTop: '22px', marginBottom: '8px', color: 'var(--forest)' }}>
                2. Création de Compte
              </h4>
              <p>
                <strong>2.1 Inscription :</strong> Pour utiliser le Service, l’utilisateur doit créer un compte personnel en fournissant une adresse email valide et un mot de passe robuste (10 caractères minimum).
              </p>
              <p>
                <strong>2.2 Confidentialité des identifiants :</strong> L’utilisateur est seul responsable du maintien de la confidentialité de ses identifiants. Toute activité réalisée depuis son compte est présumée émaner de lui.
              </p>
              <p>
                <strong>2.3 Architecture de stockage :</strong> La plateforme propose un espace personnel pour vos lectures. Les identifiants d’accès restent sous la garde exclusive de l’utilisateur.
              </p>

              <h4 style={{ fontSize: '1.02rem', marginTop: '22px', marginBottom: '8px', color: 'var(--forest)' }}>
                3. Propriété Intellectuelle et Responsabilité des Contenus
              </h4>
              <p>
                <strong>3.1 Propriété des documents :</strong> L’utilisateur conserve l’entière propriété intellectuelle des fichiers, textes, annotations et documents qu’il importe dans Folio ou Études.
              </p>
              <p>
                <strong>3.2 Légalité des contenus :</strong> L’utilisateur s’engage formellement à ne téléverser ou lier que des œuvres et fichiers dont il possède les droits légaux d’usage, de copie privée ou de diffusion (œuvres libres de droit, domaine public ou fichiers acquis légalement pour un usage personnel). Il est strictement interdit d’utiliser le Service pour stocker, partager ou diffuser des contenus illicites, piratés, diffamatoires ou contraires à l’ordre public. L’éditeur décline toute responsabilité quant à la nature ou la provenance des fichiers importés par les utilisateurs.
              </p>

              <h4 style={{ fontSize: '1.02rem', marginTop: '22px', marginBottom: '8px', color: 'var(--forest)' }}>
                4. Services Tiers (Intégration Google Drive)
              </h4>
              <p>
                Folio offre une fonctionnalité optionnelle permettant de connecter un compte Google Drive personnel :
              </p>
              <ul style={{ paddingLeft: '22px', margin: '8px 0' }}>
                <li>Cette connexion s’effectue via OAuth 2.0 fourni par Google.</li>
                <li>Folio n’accède qu’aux fichiers et dossiers que l’utilisateur choisit explicitement de synchroniser ou de stocker dans le dossier dédié à l’application.</li>
                <li>Les identifiants et jetons d’accès API sont stockés sur votre compte.</li>
                <li>L’utilisateur peut révoquer l’accès à son compte Google Drive à tout moment depuis les réglages de son compte Google ou depuis l’interface de Folio.</li>
              </ul>

              <h4 style={{ fontSize: '1.02rem', marginTop: '22px', marginBottom: '8px', color: 'var(--forest)' }}>
                5. Protection des Données Personnelles (RGPD)
              </h4>
              <p>
                La plateforme s’engage à respecter la vie privée de ses utilisateurs conformément au Règlement Général sur la Protection des Données (RGPD) :
              </p>
              <ul style={{ paddingLeft: '22px', margin: '8px 0' }}>
                <li><strong>Données collectées :</strong> adresse email (authentification), mot de passe sous forme d’empreinte cryptographique scrypt, métadonnées techniques de session (adresse IP, navigateur pour les appareils connectés), et données de lecture (progression, signets, notes).</li>
                <li><strong>Finalité :</strong> ces données ont pour unique finalité le bon fonctionnement du Service et la synchronisation de la bibliothèque. Aucune donnée n’est vendue, louée ou cédée à des tiers.</li>
                <li><strong>Droits de l’utilisateur :</strong> l’utilisateur dispose d’un droit d’accès, de rectification, d’exportation et de suppression de ses données personnelles.</li>
                <li><strong>Suppression des données :</strong> l’utilisateur peut à tout moment supprimer l’intégralité de ses livres via le bouton dédié dans les Paramètres, réinitialiser sa bibliothèque, ou demander la suppression définitive de son compte.</li>
              </ul>

              <h4 style={{ fontSize: '1.02rem', marginTop: '22px', marginBottom: '8px', color: 'var(--forest)' }}>
                6. Disponibilité du Service et Limitation de Responsabilité
              </h4>
              <p>
                Le Service est fourni « en l’état ». L’éditeur s’efforce d’assurer une disponibilité continue mais ne garantit pas une absence totale d’interruptions techniques ou de maintenances. L’éditeur ne saurait être tenu responsable des pertes de données résultant d’une manipulation de l’utilisateur ou de ses identifiants. Il est fortement conseillé de conserver des copies de sauvegarde de ses documents originaux.
              </p>

              <h4 style={{ fontSize: '1.02rem', marginTop: '22px', marginBottom: '8px', color: 'var(--forest)' }}>
                7. Modifications des CGU
              </h4>
              <p>
                L’éditeur se réserve le droit d’adapter ou de mettre à jour les présentes conditions à tout moment. La date de dernière mise à jour sera indiquée en en-tête. La poursuite de l’utilisation du Service après publication des modifications vaut acceptation des nouvelles CGU.
              </p>

              <h4 style={{ fontSize: '1.02rem', marginTop: '22px', marginBottom: '8px', color: 'var(--forest)' }}>
                8. Droit Applicable et Juridiction
              </h4>
              <p style={{ marginBottom: 0 }}>
                Les présentes CGU sont soumises au droit français et aux réglementations européennes en vigueur. Tout litige relatif à leur interprétation ou à leur exécution fera l’objet d’une tentative de résolution amiable avant toute action judiciaire.
              </p>
            </div>
          )}
        </div>

        {/* Pied de la modale */}
        <div
          style={{
            padding: '14px 24px',
            borderTop: '1px solid var(--line)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'var(--paper)',
          }}
        >
          <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
            Édité par Axel Samama (samamaaxel@gmail.com) • Hébergement en France
          </span>
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

// Alias de rétrocompatibilité
export const TermsModal = LegalModal;
