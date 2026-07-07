import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

export function useGsapTextReveal(ref: { current: HTMLElement | null }, options?: { stagger?: number; delay?: number }) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const words = el.querySelectorAll('.reveal-word');
    if (!words.length) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(words,
        { opacity: 0.1, y: 20 },
        {
          opacity: 1,
          y: 0,
          stagger: options?.stagger ?? 0.08,
          duration: 0.5,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: el,
            start: 'top 80%',
            end: 'top 30%',
            scrub: 1.5,
          },
        }
      );
    }, el);
    return () => ctx.revert();
  }, [ref, options?.stagger, options?.delay]);
}

export function useGsapImageScale(ref: { current: HTMLElement | null }) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const images = el.querySelectorAll('.scale-image');
    if (!images.length) return;
    const ctx = gsap.context(() => {
      images.forEach((img) => {
        gsap.fromTo(img,
          { scale: 0.8, opacity: 0.4 },
          {
            scale: 1,
            opacity: 1,
            scrollTrigger: {
              trigger: img,
              start: 'top 85%',
              end: 'top 35%',
              scrub: 1.2,
            },
          }
        );
        gsap.to(img, {
          opacity: 0.2,
          scale: 0.9,
          scrollTrigger: {
            trigger: img,
            start: 'top 10%',
            end: 'top -30%',
            scrub: 1,
          },
        });
      });
    }, el);
    return () => ctx.revert();
  }, [ref]);
}

export function useGsapPinSidebar(ref: { current: HTMLElement | null }, galleryRef: { current: HTMLElement | null }) {
  useEffect(() => {
    const el = ref.current;
    const gallery = galleryRef?.current;
    if (!el || !gallery) return;
    const ctx = gsap.context(() => {
      ScrollTrigger.create({
        trigger: el.parentElement,
        start: 'top 10%',
        end: () => `+=${gallery.scrollHeight - window.innerHeight + 200}`,
        pin: el,
        pinSpacing: true,
        anticipatePin: 1,
      });
    }, el);
    return () => ctx.revert();
  }, [ref, galleryRef]);
}

export function useGsapCardStack(ref: { current: HTMLElement | null }) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const cards = el.querySelectorAll('.stack-card');
    if (!cards.length) return;
    const ctx = gsap.context(() => {
      cards.forEach((card, i) => {
        if (i === 0) return;
        gsap.fromTo(card,
          { y: 120, scale: 0.92, opacity: 0.6 },
          {
            y: 0,
            scale: 1,
            opacity: 1,
            scrollTrigger: {
              trigger: card,
              start: 'top 90%',
              end: 'top 40%',
              scrub: 1.2,
            },
          }
        );
      });
    }, el);
    return () => ctx.revert();
  }, [ref]);
}

export function useGsapScrollFade(ref: { current: HTMLElement | null }) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(el,
        { opacity: 0, y: 60 },
        {
          opacity: 1,
          y: 0,
          scrollTrigger: {
            trigger: el,
            start: 'top 85%',
            end: 'top 40%',
            scrub: 1,
          },
        }
      );
    }, el);
    return () => ctx.revert();
  }, [ref]);
}
